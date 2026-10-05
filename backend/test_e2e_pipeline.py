import io
import os

import numpy as np
from app.services.ai_pipeline import AIPipelineService
from PIL import Image


def test_e2e_ai_pipeline():
    print("==========================================")
    print("Testing Task 4: Standalone End-to-End Multi-Modal AI Pipeline")
    print("==========================================")
    
    # 1. Initialize AIPipelineService
    pipeline = AIPipelineService()
    print("[OK] AIPipelineService initialized.")
    
    # 2. Create synthetic cotton leaf image bytes
    synthetic_img = Image.fromarray(np.uint8(np.random.randint(0, 255, (300, 300, 3))))
    img_byte_arr = io.BytesIO()
    synthetic_img.save(img_byte_arr, format='JPEG')
    image_bytes = img_byte_arr.getvalue()
    print(f"[OK] Generated sample leaf image bytes ({len(image_bytes)} bytes)")
    
    # 3. Create sample environmental conditions
    env_data = {
        "temperature": 34.5,
        "humidity": 62.0,
        "soil_moisture": 40.0,
        "rainfall_mm": 12.0,
        "aqi": 88.0,
        "ozone": 42.0,
        "growth_stage": "Flowering"
    }
    print(f"[OK] Sample environmental inputs: {env_data}")
    
    # 4. Process Multi-Modal Prediction
    result = pipeline.process_prediction(image_bytes, env_data, upload_dir="uploads")
    
    print("\nPipeline Result Output Structure:")
    print(f"  * Record UUID: {result['record_uuid']}")
    print(f"  * Image URL: {result['image_url']}")
    print(f"  * Grad-CAM Heatmap URL: {result['heatmap_url']}")
    print(f"  * CNN Predictions: {result['cnn_predictions']}")
    print(f"  * SNN Result: {result['snn_result']}")
    print(f"  * Recommendations ({len(result['recommendations'])}):")
    for r in result['recommendations']:
        print(f"     - {r}")
        
    # 5. Assert File Persistence
    assert os.path.exists(os.path.join("uploads", "images", f"leaf_{result['record_uuid']}.jpg")), "Original image file not saved!"
    assert os.path.exists(os.path.join("uploads", "heatmaps", f"gradcam_{result['record_uuid']}.jpg")), "Grad-CAM heatmap file not saved!"
    print("\n[OK] Image and Grad-CAM heatmap files generated and verified on disk.")

    print("\n>>> Task 4 Validation PASSED Successfully! <<<\n")

if __name__ == "__main__":
    test_e2e_ai_pipeline()
