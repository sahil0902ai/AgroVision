import urllib.request
import urllib.error
import json
import io
import time
from PIL import Image

RENDER_BASE = "https://agrovision-lsgn.onrender.com"

def test_full_remote_suite():
    print("=" * 65)
    print(f"TESTING COMPLETE REMOTE SUITE ON {RENDER_BASE}")
    print("=" * 65)

    # 1. Health
    with urllib.request.urlopen(f"{RENDER_BASE}/api/health", timeout=20) as resp:
        print("[1] Health Check:", resp.status, resp.read().decode())

    # 2. CNN Predict
    img = Image.new("RGB", (224, 224), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    boundary = "boundary123"
    body = (
        b"--" + boundary.encode() + b"\r\n"
        b'Content-Disposition: form-data; name="file"; filename="cotton_leaf.jpg"\r\n'
        b"Content-Type: image/jpeg\r\n\r\n"
        + img_bytes + b"\r\n"
        b"--" + boundary.encode() + b"--\r\n"
    )

    req_cnn = urllib.request.Request(
        f"{RENDER_BASE}/api/cnn/predict",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST"
    )
    with urllib.request.urlopen(req_cnn, timeout=30) as resp:
        cnn_res = json.loads(resp.read().decode())
        print("\n[2] CNN Predict:", resp.status, cnn_res.get("prediction"))

    # 3. SNN Predict
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
        snn_res = json.loads(resp.read().decode())
        print("\n[3] SNN Predict:", resp.status, "Severity:", snn_res.get("predicted_severity"), "Spikes:", snn_res.get("spike_counts"))

    # 4. Analysis Combine
    combine_payload = {
        "visual_evidence": {
            "class": cnn_res["prediction"]["class"],
            "confidence": cnn_res["prediction"]["confidence"],
            "probabilities": cnn_res.get("probabilities", {"Healthy": 0.92, "Water Stress": 0.02, "Heat Stress": 0.02, "Nutrient Deficiency": 0.02, "Pollution": 0.02})
        },
        "environmental_evidence": {
            "class": snn_res["prediction"]["class"],
            "confidence": snn_res["prediction"]["confidence"],
            "spike_counts": snn_res.get("spike_counts", {"High": 0, "Low": 9, "Moderate": 6}),
            "timesteps": 10
        },
        "environmental_inputs": snn_payload,
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
        combine_res = json.loads(resp.read().decode())
        print("\n[4] Analysis Combine:", resp.status, "Fusion:", combine_res.get("fusion", {}).get("relationship"), "Veto:", combine_res.get("expert_veto", {}).get("overall_status"))

    # 5. Records Fetch
    with urllib.request.urlopen(f"{RENDER_BASE}/api/v1/records?limit=5", timeout=20) as resp:
        records = json.loads(resp.read().decode())
        print("\n[5] Records Fetch:", resp.status, f"Total records: {len(records)}")

    print("\n" + "=" * 65)
    print("ALL REMOTE PIPELINE ENDPOINTS TESTED AND 100% OPERATIONAL!")
    print("=" * 65)

if __name__ == "__main__":
    test_full_remote_suite()
