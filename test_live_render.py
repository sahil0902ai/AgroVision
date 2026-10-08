import urllib.request
import urllib.parse
import json
import io
import time
from PIL import Image

RENDER_BASE = "https://agrovision-lsgn.onrender.com"

def test_live_production_backend():
    print("=" * 65)
    print("TESTING LIVE PRODUCTION BACKEND (https://agrovision-lsgn.onrender.com)")
    print("=" * 65)

    # 1. Health Check
    t0 = time.time()
    req = urllib.request.Request(f"{RENDER_BASE}/api/health")
    with urllib.request.urlopen(req, timeout=20) as resp:
        assert resp.status == 200
        health = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        print(f"[1] /api/health (200 OK, {dt:.1f}ms): {health}")

    # Generate test image
    img = Image.new("RGB", (224, 224), color=(34, 139, 34))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    # 2. Live POST /api/analysis (Multipart Form Data)
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = []
    
    fields = {
        "temperature": "31.5",
        "humidity": "65.0",
        "soil_moisture": "0.62",
        "rainfall_mm": "0.0",
        "aqi": "48.0",
        "ozone": "0.035",
        "growth_stage": "Flowering",
        "days_since_sowing": "60",
        "field_name": "Wardha Production Field A",
        "user_email": "farmer@agrovision.org"
    }
    
    for k, v in fields.items():
        body.append(f"--{boundary}".encode())
        body.append(f'Content-Disposition: form-data; name="{k}"\r\n'.encode())
        body.append(f"{v}\r\n".encode())
        
    body.append(f"--{boundary}".encode())
    body.append(b'Content-Disposition: form-data; name="file"; filename="cotton_leaf.jpg"\r\nContent-Type: image/jpeg\r\n\r\n')
    body.append(img_bytes)
    body.append(b"\r\n")
    body.append(f"--{boundary}--\r\n".encode())
    
    payload_bytes = b"\r\n".join(body)

    t0 = time.time()
    req_analysis = urllib.request.Request(
        f"{RENDER_BASE}/api/analysis",
        data=payload_bytes,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with urllib.request.urlopen(req_analysis, timeout=30) as resp:
        assert resp.status == 200
        analysis_data = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        rec_uuid = analysis_data.get("record_uuid")
        print(f"\n[2] /api/analysis (200 OK, {dt:.1f}ms):")
        print(f"    Record UUID: {rec_uuid}")
        print(f"    CNN Prediction: {analysis_data.get('cnn', {}).get('predicted_class')} ({analysis_data.get('cnn', {}).get('confidence_percentage')}%)")
        print(f"    SNN Prediction: {analysis_data.get('snn', {}).get('predicted_severity')} ({analysis_data.get('snn', {}).get('confidence_percentage')}%)")
        print(f"    Fusion: {analysis_data.get('fusion', {}).get('relationship')}")
        print(f"    Expert Veto: {analysis_data.get('expert_veto', {}).get('overall_status')}")

    # 3. Live POST /api/cnn/predict
    t0 = time.time()
    body_cnn = []
    body_cnn.append(f"--{boundary}".encode())
    body_cnn.append(b'Content-Disposition: form-data; name="file"; filename="cotton_leaf.jpg"\r\nContent-Type: image/jpeg\r\n\r\n')
    body_cnn.append(img_bytes)
    body_cnn.append(b"\r\n")
    body_cnn.append(f"--{boundary}--\r\n".encode())
    
    req_cnn = urllib.request.Request(
        f"{RENDER_BASE}/api/cnn/predict",
        data=b"\r\n".join(body_cnn),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with urllib.request.urlopen(req_cnn, timeout=30) as resp:
        assert resp.status == 200
        cnn_data = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        print(f"\n[3] /api/cnn/predict (200 OK, {dt:.1f}ms): Class={cnn_data.get('prediction', {}).get('class')}")

    # 4. Live POST /api/snn/predict
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
        "temperature": 31.5,
        "humidity": 65.0,
        "soil_moisture": 0.62,
        "rainfall": 0.0,
        "aqi": 48.0,
        "ozone": 0.035,
        "growth_stage": "Flowering",
        "days_since_sowing": 60,
        "latitude": 20.975,
        "longitude": 78.72,
        "observation_date": "2026-10-08"
    }
    t0 = time.time()
    req_snn = urllib.request.Request(
        f"{RENDER_BASE}/api/snn/predict",
        data=json.dumps(snn_payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req_snn, timeout=20) as resp:
        assert resp.status == 200
        snn_data = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        print(f"\n[4] /api/snn/predict (200 OK, {dt:.1f}ms): Severity={snn_data.get('predicted_severity')}, Spikes={snn_data.get('spike_counts')}")

    # 5. Live GET /api/v1/records
    t0 = time.time()
    req_records = urllib.request.Request(f"{RENDER_BASE}/api/v1/records?limit=5")
    with urllib.request.urlopen(req_records, timeout=20) as resp:
        assert resp.status == 200
        records = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        print(f"\n[5] /api/v1/records (200 OK, {dt:.1f}ms): Count={len(records)}")

    # 6. Live POST /api/chat
    t0 = time.time()
    chat_payload = {
        "message": "Explain CNN in simple terms for a cotton farmer.",
        "record_uuid": rec_uuid,
        "field_name": "Wardha Field A",
        "history": []
    }
    req_chat = urllib.request.Request(
        f"{RENDER_BASE}/api/chat",
        data=json.dumps(chat_payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req_chat, timeout=30) as resp:
        assert resp.status == 200
        chat_resp = json.loads(resp.read().decode())
        dt = (time.time() - t0) * 1000
        print(f"\n[6] /api/chat (200 OK, {dt:.1f}ms): Model={chat_resp.get('model_used')}, Status={chat_resp.get('status')}")
        print(f"    Reply preview: {chat_resp.get('reply', '')[:120]}...")

    print("\n" + "=" * 65)
    print("ALL LIVE PRODUCTION BACKEND ENDPOINTS ARE FULLY OPERATIONAL!")
    print("=" * 65)

if __name__ == "__main__":
    test_live_production_backend()
