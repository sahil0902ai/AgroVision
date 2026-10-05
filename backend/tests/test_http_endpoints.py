import json
import os
import urllib.error
import urllib.request
from io import BytesIO

from PIL import Image

BASE_URL = "http://127.0.0.1:8000"

def send_multipart_request(endpoint: str, field_name: str, filename: str, content_type: str, file_bytes: bytes):
    boundary = "----AgroVisionAuditBoundary777"
    lines = [
        f"--{boundary}".encode("ascii"),
        f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode(),
        f"Content-Type: {content_type}".encode(),
        b"",
        file_bytes,
        f"--{boundary}--".encode("ascii"),
        b""
    ]
    body = b"\r\n".join(lines)
    req = urllib.request.Request(
        f"{BASE_URL}{endpoint}",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    return req

def run_http_verification_suite():
    print("==================================================")
    print("AGROVISION CNN API PRODUCTION HARDENING TEST SUITE")
    print("==================================================")

    # 1. Health Check
    print("\n[Test 1] GET /api/health")
    req = urllib.request.Request(f"{BASE_URL}/api/health")
    with urllib.request.urlopen(req) as resp:
        self_check = json.loads(resp.read().decode())
        print(f"  Response: {self_check}")
        assert self_check.get("status") == "ok"
        assert self_check.get("cnn_loaded") is True
        print("  -> PASS: Health check reports ok and cnn_loaded=True")

    # 2. Valid Leaf PNG Prediction
    print("\n[Test 2] POST /api/cnn/predict (Valid Real Leaf PNG)")
    leaf_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../datasets/sample_leaves/1_water_stress/original_0199.png")
    )
    with open(leaf_path, "rb") as f:
        leaf_bytes = f.read()

    req = send_multipart_request("/api/cnn/predict", "image", "leaf.png", "image/png", leaf_bytes)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"  Predicted Class: {data['prediction']['class']} ({data['prediction']['confidence']*100:.2f}%)")
        print(f"  Probabilities: {data['probabilities']}")
        assert data["success"] is True
        assert data["prediction"]["class"] == "Water Stress"
        assert len(data["probabilities"]) == 5
        print("  -> PASS: Real PNG leaf inference returned expected 5-class distribution")

    # 3. Valid Leaf JPG Prediction
    print("\n[Test 3] POST /api/cnn/predict (Valid Real Leaf JPG)")
    jpg_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../datasets/sample_leaves/0_healthy/original_0031.jpg")
    )
    with open(jpg_path, "rb") as f:
        jpg_bytes = f.read()

    req = send_multipart_request("/api/cnn/predict", "image", "healthy_leaf.jpg", "image/jpeg", jpg_bytes)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"  Predicted Class: {data['prediction']['class']} ({data['prediction']['confidence']*100:.2f}%)")
        assert data["success"] is True
        assert len(data["probabilities"]) == 5
        print("  -> PASS: Real JPG leaf inference returned valid prediction")

    # 4. Grayscale Image Support
    print("\n[Test 4] POST /api/cnn/predict (Grayscale 1-channel Image)")
    gray_img = Image.new("L", (224, 224), color=100)
    buf = BytesIO()
    gray_img.save(buf, format="PNG")
    req = send_multipart_request("/api/cnn/predict", "image", "gray.png", "image/png", buf.getvalue())
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert data["success"] is True
        print("  -> PASS: Grayscale image safely converted to RGB and processed")

    # 5. RGBA Image Support
    print("\n[Test 5] POST /api/cnn/predict (RGBA 4-channel Image)")
    rgba_img = Image.new("RGBA", (224, 224), color=(34, 139, 34, 200))
    buf = BytesIO()
    rgba_img.save(buf, format="PNG")
    req = send_multipart_request("/api/cnn/predict", "image", "rgba.png", "image/png", buf.getvalue())
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        assert data["success"] is True
        print("  -> PASS: RGBA image safely converted to RGB and processed")

    # 6. Corrupted Image Rejection
    print("\n[Test 6] POST /api/cnn/predict (Corrupted Image Content)")
    corrupt_bytes = b"CORRUPTED_NOT_AN_IMAGE_HEADER_9999"
    req = send_multipart_request("/api/cnn/predict", "image", "bad.jpg", "image/jpeg", corrupt_bytes)
    try:
        urllib.request.urlopen(req)
        assert False, "Should have returned 422"
    except urllib.error.HTTPError as e:
        assert e.code in (400, 422), f"Expected 400 or 422, got {e.code}"
        print(f"  -> PASS: Corrupted image rejected cleanly with HTTP {e.code}")

    # 7. Unsupported Extension Rejection
    print("\n[Test 7] POST /api/cnn/predict (Unsupported File Extension .pdf)")
    pdf_bytes = b"%PDF-1.4 dummy pdf content"
    req = send_multipart_request("/api/cnn/predict", "image", "doc.pdf", "application/pdf", pdf_bytes)
    try:
        urllib.request.urlopen(req)
        assert False, "Should have returned 415"
    except urllib.error.HTTPError as e:
        assert e.code == 415, f"Expected 415, got {e.code}"
        print(f"  -> PASS: Unsupported format rejected with HTTP {e.code}")

    # 8. Empty Request Rejection
    print("\n[Test 8] POST /api/cnn/predict (Empty Request)")
    req = send_multipart_request("/api/cnn/predict", "image", "empty.jpg", "image/jpeg", b"")
    try:
        urllib.request.urlopen(req)
        assert False, "Should have returned 400"
    except urllib.error.HTTPError as e:
        assert e.code == 400, f"Expected 400, got {e.code}"
        print(f"  -> PASS: Empty file rejected with HTTP {e.code}")

    # 9. Oversized Image Rejection
    print("\n[Test 9] POST /api/cnn/predict (Oversized Image > 10MB)")
    large_bytes = b"0" * (11 * 1024 * 1024) # 11 MB
    req = send_multipart_request("/api/cnn/predict", "image", "huge.jpg", "image/jpeg", large_bytes)
    try:
        urllib.request.urlopen(req)
        assert False, "Should have returned 413"
    except urllib.error.HTTPError as e:
        assert e.code == 413, f"Expected 413, got {e.code}"
        print(f"  -> PASS: Oversized file rejected with HTTP {e.code}")

    # 10. Valid SNN Prediction
    print("\n[Test 10] POST /api/snn/predict (Valid SNN Payload)")
    snn_payload = {
        "temperature": 38.8,
        "humidity": 27.6,
        "rainfall": 0.0,
        "soil_moisture": 0.1487,
        "aqi": 110.0,
        "ozone": 0.042,
        "latitude": 20.975,
        "longitude": 78.72,
        "growth_stage": "Flowering",
        "days_since_sowing": 60.0,
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
        "observation_date": "2024-07-15"
    }
    req_snn = urllib.request.Request(
        f"{BASE_URL}/api/snn/predict",
        data=json.dumps(snn_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_snn) as resp:
        snn_data = json.loads(resp.read().decode())
        print(f"  Predicted Severity: {snn_data['prediction']['class']} ({snn_data['prediction']['confidence']*100:.2f}%)")
        print(f"  Spike Counts (T=10): {snn_data['spike_counts']}")
        assert snn_data["success"] is True
        assert snn_data["prediction"]["class"] in ["High", "Low", "Moderate"]
        assert len(snn_data["spike_counts"]) == 3
        print("  -> PASS: SNN prediction returned authentic spike counts and severity class")

    # 11. SNN Missing Input Rejection
    print("\n[Test 11] POST /api/snn/predict (Missing Environmental Field)")
    bad_snn_payload = {
        "latitude": 21.1458,
        "longitude": 79.0882
        # missing temperature, humidity, etc.
    }
    req_bad_snn = urllib.request.Request(
        f"{BASE_URL}/api/snn/predict",
        data=json.dumps(bad_snn_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req_bad_snn)
        assert False, "Should have failed with 422"
    except urllib.error.HTTPError as e:
        assert e.code in (400, 422), f"Expected 400 or 422, got {e.code}"
        print(f"  -> PASS: Incomplete SNN payload rejected with HTTP {e.code}")

    # 12. Valid Multimodal Combine Analysis
    print("\n[Test 12] POST /api/analysis/combine (Valid Multimodal Evidence Fusion & Veto)")
    combine_payload = {
        "visual_evidence": {
            "class": "Water Stress",
            "confidence": 0.94,
            "probabilities": {
                "Healthy": 0.01,
                "Water Stress": 0.94,
                "Heat Stress": 0.03,
                "Nutrient Deficiency": 0.01,
                "Pollution": 0.01
            }
        },
        "environmental_evidence": {
            "class": "High",
            "confidence": 0.98,
            "spike_counts": {"High": 9, "Low": 0, "Moderate": 1},
            "timesteps": 10
        },
        "environmental_inputs": {
            "temperature": 38.5,
            "humidity": 24.0,
            "soil_moisture": 0.15,
            "rainfall_mm": 0.0,
            "aqi": 60.0,
            "ozone": 0.035,
            "growth_stage": "Flowering"
        }
    }
    req_combine = urllib.request.Request(
        f"{BASE_URL}/api/analysis/combine",
        data=json.dumps(combine_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req_combine) as resp:
        combine_data = json.loads(resp.read().decode())
        print(f"  Fusion Relationship: {combine_data['fusion']['relationship']} (Alignment: {combine_data['fusion']['alignment_score']})")
        print(f"  Expert Veto Status : {combine_data['expert_veto']['overall_status']} ({combine_data['expert_veto']['rule_count']} rules triggered)")
        assert combine_data["success"] is True
        assert combine_data["fusion"]["relationship"] == "ALIGNED"
        assert combine_data["expert_veto"]["rule_count"] >= 1
        print("  -> PASS: Multimodal Combine returned aligned evidence and triggered expert rules")

    # 13. Combine Incomplete Request Rejection
    print("\n[Test 13] POST /api/analysis/combine (Missing Visual Evidence Rejection)")
    bad_combine_payload = {
        "environmental_evidence": {
            "class": "High",
            "confidence": 0.98
        }
    }
    req_bad_combine = urllib.request.Request(
        f"{BASE_URL}/api/analysis/combine",
        data=json.dumps(bad_combine_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req_bad_combine)
        assert False, "Should have failed with 422"
    except urllib.error.HTTPError as e:
        assert e.code in (400, 422), f"Expected 400 or 422, got {e.code}"
        print(f"  -> PASS: Incomplete combine payload rejected cleanly with HTTP {e.code}")

    print("\n==================================================")
    print(">>> ALL 13 PRODUCTION HARDENING TESTS PASSED! <<<")
    print("==================================================")

if __name__ == "__main__":
    run_http_verification_suite()
