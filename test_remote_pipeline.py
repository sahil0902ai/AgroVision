import urllib.request
import json
import io
import time
from PIL import Image

RENDER_BASE = "https://agrovision-lsgn.onrender.com"

def test_remote_endpoints():
    print("=" * 65)
    print("TESTING REMOTE RENDER ENDPOINTS")
    print("=" * 65)

    img = Image.new("RGB", (224, 224), color=(34, 139, 34))
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_bytes = img_byte_arr.getvalue()

    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"

    # 1. Test /api/cnn/predict
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
        cnn_data = json.loads(resp.read().decode())
        print(f"[1] /api/cnn/predict (200 OK): Class={cnn_data.get('prediction', {}).get('class')}")

    # 2. Test /api/snn/predict
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
    req_snn = urllib.request.Request(
        f"{RENDER_BASE}/api/snn/predict",
        data=json.dumps(snn_payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req_snn, timeout=20) as resp:
        snn_data = json.loads(resp.read().decode())
        print(f"[2] /api/snn/predict (200 OK): Severity={snn_data.get('predicted_severity')}, Spikes={snn_data.get('spike_counts')}")

    # 3. Test /api/analysis/combine
    combine_payload = {
        "cnn": cnn_data,
        "snn": snn_data,
        "environment": {
            "temperature": 31.5,
            "humidity": 65.0,
            "rainfall_mm": 0.0,
            "soil_moisture": 0.62,
            "aqi": 48.0,
            "ozone": 0.035
        },
        "field_name": "Wardha Field A",
        "user_email": "farmer@agrovision.org"
    }
    req_combine = urllib.request.Request(
        f"{RENDER_BASE}/api/analysis/combine",
        data=json.dumps(combine_payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req_combine, timeout=20) as resp:
        combine_data = json.loads(resp.read().decode())
        print(f"[3] /api/analysis/combine (200 OK): Fusion={combine_data.get('fusion', {}).get('relationship')}, Veto={combine_data.get('expert_veto', {}).get('overall_status')}")

    # 4. Test /api/v1/records
    req_records = urllib.request.Request(f"{RENDER_BASE}/api/v1/records?limit=5")
    with urllib.request.urlopen(req_records, timeout=20) as resp:
        records = json.loads(resp.read().decode())
        print(f"[4] /api/v1/records (200 OK): Count={len(records)}")

    print("\n" + "=" * 65)
    print("ALL REMOTE PIPELINE ENDPOINTS VERIFIED AND WORKING!")
    print("=" * 65)

if __name__ == "__main__":
    test_remote_endpoints()
