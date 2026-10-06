import os
from io import BytesIO
from pathlib import Path

import torch
import torch.nn.functional as F
from ai_models.agrovision_cnn import CLASS_LABELS_MAP, CLASSES, AgroVisionCNN
from PIL import Image, UnidentifiedImageError
from torchvision import transforms


class CNNInferenceEngine:
    """
    Reusable PyTorch CNN Inference Engine for Cotton Leaf Stress Detection.
    - Reuses exact AgroVisionCNN architecture from notebooks/cnn_training.ipynb.
    - Reproduces exact validation/test preprocessing transforms.
    - Uses model.eval() and torch.inference_mode().
    - Returns predicted stress class, softmax class probabilities, and 128-dim feature embeddings for SNN fusion.
    - Gracefully handles missing weights and corrupted/invalid image inputs.
    """
    def __init__(self, weights_path=None, device=None):
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)

        self.model = AgroVisionCNN(num_classes=5).to(self.device)
        self.model.eval() # Set evaluation mode
        
        self.weights_path = None
        self.weights_loaded = False

        resolved = self._find_checkpoint(weights_path)
        if resolved is not None:
            try:
                state_dict = torch.load(resolved, map_location=self.device)
                self.model.load_state_dict(state_dict)
                self.weights_loaded = True
                self.weights_path = str(resolved)
                print(f"[CNNInferenceEngine] Successfully loaded weights from: {resolved}")
            except Exception as e:
                print(f"[CNNInferenceEngine] Warning: Failed to load weights from {resolved}: {e}")
        else:
            print(f"[CNNInferenceEngine] Notice: Weights file '{weights_path}' not found. Initialized with PyTorch model architecture.")

        # Reproduce exact training/validation transforms from notebook
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])

    @staticmethod
    def _find_checkpoint(preferred: str | Path | None) -> Path | None:
        if preferred:
            p = Path(preferred)
            if p.is_file():
                return p.resolve()
            module_dir = Path(__file__).resolve().parent.parent
            if (module_dir / preferred).is_file():
                return (module_dir / preferred).resolve()
            if (module_dir.parent / preferred).is_file():
                return (module_dir.parent / preferred).resolve()
            return None

        for candidate in (
            Path("models/best_agrovision_cnn.pth"),
            Path("backend/models/best_agrovision_cnn.pth"),
            Path("../models/best_agrovision_cnn.pth"),
            Path(__file__).resolve().parent.parent / "models" / "best_agrovision_cnn.pth",
            Path("best_agrovision_cnn.pth"),
            Path("../best_agrovision_cnn.pth"),
        ):
            if candidate.is_file():
                return candidate.resolve()
        return None

    def preprocess_image(self, image_input):
        """
        Accepts PIL Image, file path (str/Path), bytes, or BytesIO buffer.
        Validates image integrity and returns shape (1, 3, 224, 224) tensor.
        Raises ValueError if image is invalid or corrupted.
        """
        try:
            if isinstance(image_input, (str, Path)):
                path = Path(image_input)
                if not path.exists():
                    raise ValueError(f"Image file path does not exist: {path}")
                img = Image.open(path)
            elif isinstance(image_input, bytes):
                img = Image.open(BytesIO(image_input))
            elif isinstance(image_input, BytesIO):
                img = Image.open(image_input)
            elif isinstance(image_input, Image.Image):
                img = image_input
            else:
                raise ValueError(f"Unsupported image input type: {type(image_input)}")

            img = img.convert("RGB") # Ensure 3-channel RGB
            img_tensor = self.transform(img).unsqueeze(0).to(self.device)
            return img_tensor, img

        except (UnidentifiedImageError, OSError, ValueError) as e:
            raise ValueError(f"Invalid or corrupted image input: {e}")

    def predict(self, image_input):
        """
        Executes CNN inference under torch.inference_mode() and model.eval().
        
        Returns:
            dict containing:
                - predicted_class_index: int (0 to 4)
                - predicted_class_raw: str ('0_healthy', etc.)
                - predicted_class_label: str ('Healthy', 'Water Stress', etc.)
                - confidence_score: float (0.0 to 1.0)
                - class_probabilities: dict mapping human label to probability
                - visual_feature_vector: np.ndarray shape (128,) for SNN fusion
                - feature_map_tensor: torch.Tensor shape (1, 128, 28, 28) for Grad-CAM
                - weights_loaded: bool
        """
        img_tensor, pil_img = self.preprocess_image(image_input)
        
        self.model.eval() # Ensure evaluation mode
        
        with torch.inference_mode(): # Ultra-fast inference mode without gradient tracking
            logits = self.model(img_tensor)
            probs_tensor = F.softmax(logits, dim=1).squeeze(0)
            probs = probs_tensor.cpu().numpy()
            
            # Extract 128-dim intermediate dense visual feature embedding for SNN fusion
            dense_features, feature_maps = self.model.extract_features(img_tensor)
            dense_features_np = dense_features.squeeze(0).cpu().numpy()

        pred_idx = int(torch.argmax(probs_tensor).item())
        pred_raw = CLASSES[pred_idx]
        pred_label = CLASS_LABELS_MAP[pred_raw]
        confidence = float(probs[pred_idx])

        class_probabilities = {
            CLASS_LABELS_MAP[cls_name]: float(probs[i])
            for i, cls_name in enumerate(CLASSES)
        }

        return {
            "predicted_class_index": pred_idx,
            "predicted_class_raw": pred_raw,
            "predicted_class_label": pred_label,
            "confidence_score": confidence,
            "class_probabilities": class_probabilities,
            "visual_feature_vector": dense_features_np, # 128-dim vector for SNN fusion
            "feature_map_tensor": feature_maps, # Convolutional tensor for Grad-CAM
            "weights_loaded": self.weights_loaded
        }
