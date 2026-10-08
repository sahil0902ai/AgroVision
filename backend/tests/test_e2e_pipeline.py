import os
import sys
import json
import io
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app

def run_e2e_tests():
    client = TestClient(app)
    print("=" * 60)
    print("AGROVISION END-TO-END PIPELINE & BUTTON ACTION AUDIT")
    print("=" * 60)

    # 1. Health check
    res_health = client.get("/api/health")
    assert res_health.status_code == 200, f"Health check failed: {res_health.status_code}"
    health_data = res_health.json()
    print(f"[1] Health Check: Status={health_data.get('status')}, Models Loaded={health_data.get('models_loaded')}")

    # Generate in-memory valid RGB test image
    img = Image.new("RGB", (224, 224), color=(34, 139, 34))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    # 2. Test Leaf Analysis / Run Analysis (Full Pipeline)
    print("\n[2] Testing Full Multimodal Leaf Analysis (POST /api/analysis)...")
    files = {"file": ("cotton_test_leaf.jpg", img_bytes, "image/jpeg")}
    data = {
        "temperature": "32.5",
        "humidity": "68.0",
        "soil_moisture": "0.45",
        "rainfall_mm": "0.0",
        "aqi": "55.0",
        "ozone": "0.038",
        "growth_stage": "Flowering",
        "days_since_sowing": "60",
        "field_name": "Wardha Test Field A"
    }
    res_analysis = client.post("/api/analysis", files=files, data=data)
    assert res_analysis.status_code == 200, f"Full analysis failed: {res_analysis.status_code} - {res_analysis.text}"
    analysis_json = res_analysis.json()
    rec_uuid = analysis_json.get("record_uuid")
    print(f" -> Analysis Success! UUID: {rec_uuid}")
    print(f" -> CNN Prediction: {analysis_json.get('cnn', {}).get('predicted_class')} ({analysis_json.get('cnn', {}).get('confidence_percentage')}%)")
    print(f" -> SNN Prediction: {analysis_json.get('snn', {}).get('predicted_severity')} ({analysis_json.get('snn', {}).get('confidence_percentage')}%)")
    print(f" -> Fusion Concordance: {analysis_json.get('fusion', {}).get('relationship')}")
    print(f" -> Expert Veto Status: {analysis_json.get('expert_veto', {}).get('overall_status')}")

    # 3. Test CNN Inference Only (POST /api/cnn/predict)
    print("\n[3] Testing CNN Visual Scan Only (POST /api/cnn/predict)...")
    res_cnn = client.post("/api/cnn/predict", files={"file": ("cotton_test_leaf.jpg", img_bytes, "image/jpeg")})
    assert res_cnn.status_code == 200, f"CNN predict failed: {res_cnn.status_code} - {res_cnn.text}"
    cnn_json = res_cnn.json()
    print(f" -> CNN Only Success! Class: {cnn_json.get('prediction', {}).get('class')}, Probabilities: {list(cnn_json.get('probabilities', {}).keys())}")

    # 4. Test SNN Inference Only (POST /api/snn/predict)
    print("\n[4] Testing SNN Climate Simulation Only (POST /api/snn/predict)...")
    snn_payload = {
        "soil_nitrogen": 280.0,
        "soil_phosphorus": 13.5,
        "soil_potassium": 122.4,
        "ndvi": 0.50,
        "evi": 0.36,
        "gndvi": 0.42,
        "sif_740": 1.35,
        "f687": 1.27,
        "f760": 1.60,
        "fluorescence_ratio": 0.82,
        "chlorophyll_content": 42.2,
        "leaf_area_index": 2.52,
        "light": 553.0,
        "temperature": 32.5,
        "humidity": 68.0,
        "soil_moisture": 0.45,
        "rainfall": 0.0,
        "aqi": 55.0,
        "ozone": 0.038,
        "growth_stage": "Flowering",
        "days_since_sowing": 60,
        "latitude": 20.975,
        "longitude": 78.72,
        "observation_date": "2026-10-08"
    }
    res_snn = client.post("/api/snn/predict", json=snn_payload)
    assert res_snn.status_code == 200, f"SNN predict failed: {res_snn.status_code} - {res_snn.text}"
    snn_json = res_snn.json()
    print(f" -> SNN Only Success! Severity: {snn_json.get('predicted_severity')}, Spikes: {snn_json.get('spike_counts')}")

    # 5. Test History Record Fetch (GET /api/v1/records)
    print("\n[5] Testing History & Detail Record Retrieval...")
    res_records = client.get("/api/v1/records?limit=5")
    assert res_records.status_code == 200, f"Fetch records failed: {res_records.status_code}"
    records_list = res_records.json()
    print(f" -> Retrieved {len(records_list)} historical records from SQLite")

    # Fetch specific record detail
    if rec_uuid:
        res_detail = client.get(f"/api/v1/records/{rec_uuid}")
        assert res_detail.status_code == 200, f"Fetch detail failed: {res_detail.status_code}"
        print(f" -> Verified specific record retrieval for {rec_uuid}")

    # 6. Test AI Assistant Chat (/api/chat)
    print("\n[6] Testing Grounded AI Assistant with Analysis Context...")
    chat_payload = {
        "message": "What immediate steps should I take for this crop?",
        "record_uuid": rec_uuid,
        "field_name": "Wardha Test Field A",
        "history": []
    }
    res_chat = client.post("/api/chat", json=chat_payload)
    assert res_chat.status_code == 200, f"Chat failed: {res_chat.status_code} - {res_chat.text}"
    chat_json = res_chat.json()
    print(f" -> Assistant Reply Received (Length={len(chat_json.get('reply', ''))}), Model={chat_json.get('model_used')}")

    print("\n" + "=" * 60)
    print("[PASSED] ALL WORKFLOWS, BUTTON ACTIONS, AND API ENDPOINTS VALIDATED!")
    print("=" * 60)

if __name__ == "__main__":
    run_e2e_tests()
