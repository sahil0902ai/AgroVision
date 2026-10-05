import numpy as np
import torch
import torch.nn.functional as F
from ai_models.agrovision_cnn import (
    CLASS_LABELS_MAP,
    CLASSES,
    AgroVisionCNN,
    get_cnn_transforms,
)
from PIL import Image


def test_cnn_inference():
    print("==========================================")
    print("Testing Task 1: AgroVisionCNN Inference Engine")
    print("==========================================")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using execution device: {device}")
    
    # 1. Instantiate Model
    model = AgroVisionCNN(num_classes=5).to(device)
    model.eval()
    print("[OK] AgroVisionCNN model instantiated successfully.")
    
    # 2. Test Input Transforms & Forward Pass
    synthetic_img = Image.fromarray(np.uint8(np.random.randint(0, 255, (224, 224, 3))))
    transform = get_cnn_transforms()
    img_tensor = transform(synthetic_img).unsqueeze(0).to(device)
    print(f"[OK] Input image transformed to tensor shape: {img_tensor.shape}")
    
    # 3. Model Inference & Feature Extraction
    with torch.no_grad():
        logits = model(img_tensor)
        probs = F.softmax(logits, dim=1).squeeze().cpu().numpy()
        dense_feats, feat_map = model.extract_features(img_tensor)

    print(f"[OK] Logits output shape: {logits.shape}")
    print(f"[OK] Dense feature embedding shape: {dense_feats.shape} (128-dim visual vector)")
    print(f"[OK] Feature map shape: {feat_map.shape}")
    
    # 4. Class Output Verification
    print("\nCalculated Softmax Probabilities:")
    prob_sum = 0.0
    for idx, cls_name in enumerate(CLASSES):
        prob_val = float(probs[idx])
        prob_sum += prob_val
        print(f"  - [{idx}] {CLASS_LABELS_MAP[cls_name]} ({cls_name}): {prob_val * 100:.2f}%")
        
    print(f"\n[OK] Probability sum: {prob_sum:.4f} (expected: 1.0)")
    assert abs(prob_sum - 1.0) < 1e-4, "Softmax probabilities do not sum to 1.0!"
    print("\n>>> Task 1 Validation PASSED Successfully! <<<\n")

if __name__ == "__main__":
    test_cnn_inference()
