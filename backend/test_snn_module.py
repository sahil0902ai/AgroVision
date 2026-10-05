import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from ai_models.snn_inference import SNN_CLASSES, SNNInferenceEngine


def load_actual_test_data():
    """Loads actual test rows from datasets/Agrovision Cotoon SNN Dataset.csv."""
    possible_paths = [
        Path("../datasets/Agrovision Cotoon SNN Dataset.csv"),
        Path("datasets/Agrovision Cotoon SNN Dataset.csv")
    ]
    for p in possible_paths:
        if p.exists():
            print(f"[OK] Loading actual dataset from: {p}")
            return pd.read_csv(p)
    return None

def test_snn_inference_engine():
    print("==================================================")
    print("Testing Reusable SNNInferenceEngine Module")
    print("==================================================")

    # 1. Instantiate SNN Inference Engine
    weights_path = "models/agrovision_snn.pth"
    engine = SNNInferenceEngine(weights_path=weights_path)
    print("[OK] SNNInferenceEngine instantiated successfully.")

    # 2. Test using actual field dataset test rows
    df = load_actual_test_data()
    if df is not None:
        print(f"[OK] Dataset shape: {df.shape}")
        
        # Select 3 sample rows representing different stress levels
        sample_indices = [0, 100, 500]
        print("\n--- Running Inference on Actual Field Dataset Rows ---")
        
        for idx in sample_indices:
            row = df.iloc[idx]
            ground_truth = row.get("stress_label", "Unknown")
            
            result = engine.predict(row)
            
            print(f"\nSample Row #{idx}:")
            print(f"  * Air Temp: {row.get('air_temperature_C')}°C, Humidity: {row.get('humidity_percent')}%, Soil Moisture: {row.get('soil_moisture')}")
            print(f"  * Ground Truth Label : {ground_truth}")
            print(f"  * Predicted Severity : {result['predicted_severity']}")
            print(f"  * Spike Activity Score: {result['class_scores'][result['predicted_severity']] * 100:.2f}%")
            print(f"  * Spike Counts (T=10): {result['spike_counts']}")

            assert result['predicted_severity'] in SNN_CLASSES, f"Invalid severity: {result['predicted_severity']}"
            assert result['total_spikes'] >= 0, "Spike count cannot be negative!"
            assert abs(sum(result['class_scores'].values()) - 1.0) < 1e-4, "Class scores must sum to 1.0!"
            print("  [OK] Output verification passed for this row.")
    else:
        print("Notice: Actual CSV dataset file not found. Testing synthetic structured input.")
        dummy_row = {"temperature": 30.0, "humidity": 70.0, "rainfall": 10.0, "soil_moisture": 0.4,
                     "aqi": 80.0, "ozone": 0.04, "latitude": 21.0, "longitude": 78.5,
                     "growth_stage": "Flowering", "days_since_sowing": 60, "soil_nitrogen": 280.0,
                     "soil_phosphorus": 12.0, "soil_potassium": 120.0, "ndvi": 0.5, "evi": 0.3,
                     "gndvi": 0.4, "sif_740": 1.2, "f687": 1.0, "f760": 1.3,
                     "fluorescence_ratio": 0.8, "chlorophyll_content": 40.0,
                     "leaf_area_index": 2.5, "light": 600.0}
        result = engine.predict(dummy_row)
        print(f"[OK] Structured-input prediction: {result['predicted_severity']}")

    # 3. Test Missing / Invalid Input Error Handling
    #    (the engine never fills missing values with defaults - it raises)
    print("\n--- Testing Missing Input Error Handling ---")
    incomplete_payload = {"temperature": 30.0}
    try:
        engine.predict(incomplete_payload)
        print("[FAIL] Engine should have raised ValueError for missing required inputs!")
        assert False, "Failed missing-input error handling test"
    except ValueError as ve:
        print(f"[OK] Correctly caught missing-input error: {ve}")

    invalid_stage = {
        "temperature": 30.0, "humidity": 70.0, "rainfall": 10.0, "soil_moisture": 0.4,
        "aqi": 80.0, "ozone": 0.04, "latitude": 21.0, "longitude": 78.5,
        "growth_stage": "Harvest", "days_since_sowing": 60, "soil_nitrogen": 280.0,
        "soil_phosphorus": 12.0, "soil_potassium": 120.0, "ndvi": 0.5, "evi": 0.3,
        "gndvi": 0.4, "sif_740": 1.2, "f687": 1.0, "f760": 1.3,
        "fluorescence_ratio": 0.8, "chlorophyll_content": 40.0,
        "leaf_area_index": 2.5, "light": 600.0,
    }
    try:
        engine.predict(invalid_stage)
        print("[FAIL] Engine should have raised ValueError for invalid growth_stage!")
        assert False, "Failed invalid-growth-stage error handling test"
    except ValueError as ve:
        print(f"[OK] Correctly caught invalid growth stage error: {ve}")

    # 4. Test Missing Weights Handling Gracefully
    print("\n--- Testing Missing Weights Handling ---")
    missing_weights_engine = SNNInferenceEngine(weights_path="models/non_existent_snn_weights.pth")
    assert missing_weights_engine.weights_loaded is False, "weights_loaded flag should be False for missing weights!"
    print("[OK] Missing weights handled gracefully without application crash.")

    print("\n==================================================")
    print(">>> Reusable SNNInferenceEngine Module Test PASSED! <<<")
    print("==================================================")

if __name__ == "__main__":
    test_snn_inference_engine()
