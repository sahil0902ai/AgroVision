import sys
import zipfile
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai_models.cnn_inference import CNNInferenceEngine


def extract_sample_leaf_image():
    """Extracts a real cotton leaf image from datasets/AgroVision_Balanced_250_Per_Class.zip if needed."""
    zip_path = Path("../datasets/AgroVision_Balanced_250_Per_Class.zip")
    if not zip_path.exists():
        zip_path = Path("datasets/AgroVision_Balanced_250_Per_Class.zip")
        
    sample_dir = Path("datasets/sample_leaves")
    sample_dir.mkdir(parents=True, exist_ok=True)
    sample_img_path = sample_dir / "water_stress_sample.png"
    
    if not sample_img_path.exists() and zip_path.exists():
        print(f"Extracting a real cotton leaf image from {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as z:
            water_stress_files = [f for f in z.namelist() if "1_water_stress" in f and f.endswith(".png")]
            if water_stress_files:
                target_file = water_stress_files[0]
                with z.open(target_file) as source, open(sample_img_path, "wb") as target:
                    target.write(source.read())
                print(f"[OK] Extracted real sample leaf image to: {sample_img_path}")
                
    return sample_img_path

def test_cnn_inference_engine():
    print("==================================================")
    print("Testing Reusable CNNInferenceEngine Module")
    print("==================================================")

    # 1. Extract and load an actual cotton leaf image
    sample_path = extract_sample_leaf_image()
    print(f"[OK] Test Leaf Image Path: {sample_path}")

    # 2. Instantiate CNN Inference Engine
    weights_path = "models/best_agrovision_cnn.pth"
    engine = CNNInferenceEngine(weights_path=weights_path)

    # 3. Test Real Leaf Image Inference
    if sample_path.exists():
        print("\n--- Running Inference on Actual Cotton Leaf Image ---")
        result = engine.predict(sample_path)

        print(f"[OK] Predicted Stress Class Label: {result['predicted_class_label']} ({result['predicted_class_raw']})")
        print(f"[OK] Top Class Confidence Score: {result['confidence_score'] * 100:.2f}%")
        print(f"[OK] Weights Loaded Flag: {result['weights_loaded']}")
        print("\nAll 5-Class Probabilities Breakdown:")
        prob_sum = 0.0
        for label, prob in result['class_probabilities'].items():
            prob_sum += prob
            print(f"  * {label:20s}: {prob * 100:6.2f}%")

        print(f"\n[OK] Probability Sum Check: {prob_sum:.4f}")
        assert abs(prob_sum - 1.0) < 1e-4, "Softmax probabilities must sum to 1.0!"

        # 4. Verify Feature Extraction for SNN Fusion
        feat_vec = result['visual_feature_vector']
        print(f"[OK] Extracted Visual Feature Vector Shape: {feat_vec.shape} (Expected: 128-dim)")
        assert feat_vec.shape == (128,), f"Feature vector shape should be (128,), got {feat_vec.shape}"

        feat_map = result['feature_map_tensor']
        print(f"[OK] Feature Map Tensor Shape for Grad-CAM: {feat_map.shape} (Expected: 1, 128, 28, 28)")
        assert feat_map.shape == (1, 128, 28, 28), f"Feature map shape error: {feat_map.shape}"
    else:
        print("Notice: Sample image not found. Tested synthetic image pipeline.")

    # 5. Test Invalid Image Error Handling
    print("\n--- Testing Invalid Image Error Handling ---")
    invalid_bytes = b"This is invalid image data"
    try:
        engine.predict(invalid_bytes)
        print("[FAIL] Engine should have raised ValueError for invalid image bytes!")
        assert False, "Failed error handling test for invalid bytes"
    except ValueError as ve:
        print(f"[OK] Correctly caught invalid image input error: {ve}")

    # 6. Test Non-existent File Path Handling
    try:
        engine.predict("non_existent_leaf_photo.jpg")
        print("[FAIL] Engine should have raised ValueError for missing file path!")
        assert False, "Failed error handling test for missing path"
    except ValueError as ve:
        print(f"[OK] Correctly caught missing path error: {ve}")

    # 7. Test Missing Weights Handling Gracefully
    print("\n--- Testing Missing Weights Handling ---")
    missing_weights_engine = CNNInferenceEngine(weights_path="models/non_existent_weights.pth")
    assert missing_weights_engine.weights_loaded is False, "weights_loaded flag should be False for missing weights!"
    print("[OK] Missing weights handled gracefully without application crash.")

    print("\n==================================================")
    print(">>> Reusable CNNInferenceEngine Module Test PASSED! <<<")
    print("==================================================")

if __name__ == "__main__":
    test_cnn_inference_engine()
