import logging
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

import torch
import torch.nn.functional as F
from ..core.config import settings
from ..models.cnn_model import CLASS_NAMES, AgroVisionCNN, get_inference_transforms
from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("agrovision.cnn_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

class CNNService:
    """
    AgroVision CNN Visual Stress Inference Service.
    - Singleton pattern: Loads model weights once at startup into GPU/CPU memory.
    - Uses deterministic preprocessing (224x224, RGB, ImageNet normalization).
    - Executes under torch.inference_mode() / torch.no_grad() and model.eval().
    - Returns 5-class probability distribution and top visual stress prediction.
    """
    _instance: Optional["CNNService"] = None

    def __init__(self, model_path: str | None = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AgroVisionCNN(num_classes=len(CLASS_NAMES)).to(self.device)
        self.model.eval()
        self.transform = get_inference_transforms()
        self.weights_loaded = False
        self.model_path = None

        self._load_weights(model_path or settings.CNN_MODEL_PATH)

    @classmethod
    def get_instance(cls, model_path: str | None = None) -> "CNNService":
        if cls._instance is None:
            cls._instance = CNNService(model_path=model_path)
        return cls._instance

    def _find_checkpoint(self, preferred_path: str | None) -> Path | None:
        candidate_paths = []
        if preferred_path:
            candidate_paths.append(Path(preferred_path))
        
        # Standard relative search locations
        candidate_paths.extend([
            Path("models/best_agrovision_cnn.pth"),
            Path("backend/models/best_agrovision_cnn.pth"),
            Path("../models/best_agrovision_cnn.pth"),
            Path("best_agrovision_cnn.pth"),
            Path("../best_agrovision_cnn.pth"),
            Path("models/AgroVision_CNN_baseline.pth"),
            Path("backend/models/AgroVision_CNN_baseline.pth"),
            Path("AgroVision_CNN_baseline.pth"),
            Path("../AgroVision_CNN_baseline.pth"),
        ])

        for p in candidate_paths:
            if p.exists() and p.is_file():
                return p.resolve()
        return None

    def _load_weights(self, model_path: str | None):
        resolved_path = self._find_checkpoint(model_path)
        
        if resolved_path is None:
            logger.error(
                "CRITICAL: CNN model checkpoint not found! "
                "Please place 'best_agrovision_cnn.pth' in 'backend/models/' directory or set CNN_MODEL_PATH."
            )
            self.weights_loaded = False
            return

        try:
            logger.info(f"Loading CNN checkpoint from: {resolved_path}")
            checkpoint = torch.load(resolved_path, map_location=self.device)
            
            # Robust loader handling dictionary wrapper or direct state dict
            if isinstance(checkpoint, dict):
                if "model_state_dict" in checkpoint:
                    state_dict = checkpoint["model_state_dict"]
                elif "state_dict" in checkpoint:
                    state_dict = checkpoint["state_dict"]
                else:
                    state_dict = checkpoint
            else:
                state_dict = checkpoint

            self.model.load_state_dict(state_dict)
            self.model.eval()
            self.weights_loaded = True
            self.model_path = str(resolved_path)

            trainable_params = sum(p.numel() for p in self.model.parameters() if p.requires_grad)
            logger.info(
                f"CNN model loaded successfully on device: {self.device.type.upper()} "
                f"({trainable_params:,} trainable parameters). "
                f"Classes: {', '.join(CLASS_NAMES)}"
            )

        except Exception as e:
            logger.error(f"Failed to load CNN model weights from {resolved_path}: {e}", exc_info=True)
            self.weights_loaded = False

    def validate_and_preprocess(self, image_bytes: bytes) -> tuple[torch.Tensor, Image.Image]:
        """
        Validates image content and returns preprocessed (1, 3, 224, 224) tensor and PIL image.
        Converts grayscale / RGBA / paletted images to standard 3-channel RGB.
        Raises ValueError on corrupted or unreadable images.
        """
        if not image_bytes or len(image_bytes) == 0:
            raise ValueError("Empty image data provided.")

        try:
            pil_img = Image.open(BytesIO(image_bytes))
            pil_img.verify() # Verify file integrity
            # Reopen for actual pixel conversion
            pil_img = Image.open(BytesIO(image_bytes))
            rgb_img = pil_img.convert("RGB")
        except (UnidentifiedImageError, OSError, ValueError) as e:
            raise ValueError(f"The selected image could not be read or is corrupted: {e}")

        img_tensor = self.transform(rgb_img).unsqueeze(0).to(self.device)
        return img_tensor, rgb_img

    def predict(self, image_bytes: bytes) -> dict[str, Any]:
        """
        Executes CNN visual stress classification on raw image bytes.
        Returns dictionary with predicted class, confidence, 5-class probability distribution,
        and advisory warning flag if confidence is below screening threshold.
        """
        if not self.weights_loaded:
            raise RuntimeError("CNN model is not available. Please ensure model weights are placed in backend/models.")

        start_time = time.perf_counter()
        img_tensor, _ = self.validate_and_preprocess(image_bytes)

        self.model.eval()
        with torch.no_grad():
            logits = self.model(img_tensor)
            probs_tensor = F.softmax(logits, dim=1).squeeze(0)
            probs = probs_tensor.cpu().numpy()

        pred_idx = int(torch.argmax(probs_tensor).item())
        pred_class = CLASS_NAMES[pred_idx]
        confidence = float(probs[pred_idx])

        # 5-class probability distribution
        probabilities = {
            cls_name: round(float(probs[i]), 4)
            for i, cls_name in enumerate(CLASS_NAMES)
        }

        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.info(f"Inference completed in {duration_ms}ms -> Predicted: {pred_class} ({confidence * 100:.2f}%)")

        is_low_confidence = confidence < settings.CONFIDENCE_ADVISORY_THRESHOLD
        advisory_message = None
        if is_low_confidence:
            advisory_message = "Low confidence prediction. Consider reviewing the image and environmental conditions."

        return {
            "success": True,
            "model": "AgroVision CNN",
            "prediction": {
                "class": pred_class,
                "confidence": round(confidence, 4)
            },
            "probabilities": probabilities,
            "preprocessing": {
                "image_size": 224,
                "channels": 3,
                "normalization": "ImageNet"
            },
            "low_confidence_warning": is_low_confidence,
            "advisory_message": advisory_message,
            "inference_time_ms": duration_ms
        }
