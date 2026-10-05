import os
import sys
import zipfile
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.ai_pipeline import AIPipelineService


def extract_real_leaf_image():
    """Extracts a real cotton leaf image from datasets/AgroVision_Balanced_250_Per_Class.zip if available."""
    zip_path = Path("../datasets/AgroVision_Balanced_250_Per_Class.zip")
    if not zip_path.exists():
        zip_path = Path("datasets/AgroVision_Balanced_250_Per_Class.zip")
        
    sample_dir = Path("datasets/sample_leaves")
    sample_dir.mkdir(parents=True, exist_ok=True)
    sample_img_path = sample_dir / "real_cotton_leaf.png"
    
    if not sample_img_path.exists() and zip_path.exists():
        print(f"Extracting a real cotton leaf image from {zip_path}...")
        with zipfile.ZipFile(zip_path, 'r') as z:
            leaf_files = [f for f in z.namelist() if f.endswith(".png")]
            if leaf_files:
                target_file = leaf_files[0]
                with z.open(target_file) as source, open(sample_img_path, "wb") as target:
                    target.write(source.read())
                print(f"[OK] Extracted real sample leaf image to: {sample_img_path}")
                
    return sample_img_path

def test_multimodal_fusion_e2e():
    print("==================================================")
    print("Testing Multi-Modal CNN-SNN Feature Fusion Engine")
    print("==================================================")

    # 1. Obtain Real Cotton Leaf Image
    leaf_path = extract_real_leaf_image()
    print(f"[OK] Test Leaf Image Path: {leaf_path}")

    with open(leaf_path, "rb") as f:
        image_bytes = f.read()

    # 2. Define Valid Environmental Sensor Inputs
    env_inputs = {
        "temperature": 38.5,        # High temperature (°C)
        "humidity": 32.0,           # Low humidity (%)
        "soil_moisture": 18.0,      # Low soil moisture (%)
        "rainfall_mm": 5.0,         # Minimal rainfall forecast (mm)
        "aqi": 95.0,                # Air Quality Index
        "ozone": 48.0,              # Ozone (ppb)
        "growth_stage": "Flowering" # Crop growth stage
    }
    print("\n[OK] Environmental Input Conditions:")
    for k, v in env_inputs.items():
        print(f"  * {k:20s}: {v}")

    # 3. Instantiate Multi-Modal AI Pipeline
    pipeline = AIPipelineService()
    print("\n[OK] AIPipelineService initialized.")

    # 4. Execute Multi-Modal Fusion Prediction
    print("\n--- Running Multi-Modal Fusion Inference ---")
    result = pipeline.process_prediction(image_bytes, env_inputs, upload_dir="uploads")

    print("\n[OK] Multi-Modal Fusion Result Output:")
    print(f"  * Record UUID          : {result['record_uuid']}")
    print(f"  * Visual Feature Dim   : {result['visual_feature_dim']} (CNN 128-dim embedding)")
    print(f"  * CNN Leaf Predictions : {result['cnn_predictions']}")
    print(f"  * SNN Severity Verdict : {result['snn_result']['severity']} ({result['snn_result']['confidence_percent']}% Confidence)")
    print(f"  * SNN Spike Counts     : High: {result['snn_result']['spike_counts'][0]}, Low: {result['snn_result']['spike_counts'][1]}, Moderate: {result['snn_result']['spike_counts'][2]}")
    print(f"  * Saved Heatmap Image  : {result['heatmap_url']}")

    print("\nExpert Recommendations Generated:")
    for rec in result['recommendations']:
        print(f"  * {rec}")

    # 5. Assertions & Validation
    assert result['visual_feature_dim'] == 128, "CNN Visual feature vector must be 128-dimensional!"
    assert result['snn_result']['severity'] in ["High", "Low", "Moderate"], "SNN severity verdict must be High, Low, or Moderate!"
    assert os.path.exists(os.path.join("uploads", "images", f"leaf_{result['record_uuid']}.jpg")), "Saved leaf image missing!"
    assert os.path.exists(os.path.join("uploads", "heatmaps", f"gradcam_{result['record_uuid']}.jpg")), "Grad-CAM heatmap image missing!"
    print("\n[OK] All multi-modal shape validations and file persistence assertions PASSED.")

    print("\n==================================================")
    print(">>> Multi-Modal Feature Fusion Test PASSED! <<<")
    print("==================================================")

if __name__ == "__main__":
    test_multimodal_fusion_e2e()
