import urllib.request
import urllib.error
import json
import io
import time
from PIL import Image

VERCEL_BASE = "https://agro-vision-dun.vercel.app"

def test_vercel_dashboard():
    print("=" * 65)
    print("TESTING LIVE VERCEL DEPLOYMENT AT:", VERCEL_BASE)
    print("=" * 65)

    # 1. Static & Routed HTML Pages
    pages = ["/dashboard", "/overview", "/analysis", "/history", "/reports", "/assistant", "/login", "/index.html"]
    for p in pages:
        req = urllib.request.Request(f"{VERCEL_BASE}{p}", headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                print(f"[Page] {p:<16} -> Status {resp.status} ({len(resp.read())} bytes)")
        except Exception as e:
            print(f"[Page] {p:<16} -> FAILED: {e}")

    # 2. Live API Health via Vercel Proxy
    try:
        with urllib.request.urlopen(f"{VERCEL_BASE}/api/health", timeout=15) as resp:
            print("\n[API] /api/health -> Status", resp.status, resp.read().decode())
    except Exception as e:
        print("\n[API] /api/health -> FAILED:", e)

    # 3. Live Records via Vercel Proxy
    try:
        with urllib.request.urlopen(f"{VERCEL_BASE}/api/v1/records?limit=5", timeout=15) as resp:
            records = json.loads(resp.read().decode())
            print("[API] /api/v1/records -> Status", resp.status, f"Total records: {len(records)}")
    except Exception as e:
        print("[API] /api/v1/records -> FAILED:", e)

    # 4. CNN Predict via Vercel Proxy
    try:
        img = Image.new("RGB", (224, 224), color=(34, 139, 34))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        img_bytes = buf.getvalue()
        boundary = "boundary_vercel_123"
        body = (
            b"--" + boundary.encode() + b"\r\n"
            b'Content-Disposition: form-data; name="file"; filename="leaf.jpg"\r\n'
            b"Content-Type: image/jpeg\r\n\r\n"
            + img_bytes + b"\r\n"
            b"--" + boundary.encode() + b"--\r\n"
        )
        req_cnn = urllib.request.Request(
            f"{VERCEL_BASE}/api/cnn/predict",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "Mozilla/5.0"},
            method="POST"
        )
        with urllib.request.urlopen(req_cnn, timeout=25) as resp:
            cnn_res = json.loads(resp.read().decode())
            print("[API] /api/cnn/predict -> Status", resp.status, cnn_res.get("prediction"))
    except Exception as e:
        print("[API] /api/cnn/predict -> FAILED:", e)

    # 5. SNN Predict via Vercel Proxy
    try:
        snn_payload = {
            "soil_nitrogen": 280.0, "soil_phosphorus": 13.5, "soil_potassium": 122.4,
            "ndvi": 0.50, "evi": 0.36, "gndvi": 0.42, "sif_740": 1.35, "f687": 1.27, "f760": 1.60,
            "fluorescence_ratio": 0.82, "chlorophyll_content": 42.2, "leaf_area_index": 2.52, "light": 553.0,
            "temperature": 31.5, "humidity": 65.0, "soil_moisture": 0.62, "rainfall": 0.0, "aqi": 48.0, "ozone": 0.035,
            "growth_stage": "Flowering", "days_since_sowing": 60, "latitude": 20.975, "longitude": 78.72, "observation_date": "2026-10-08"
        }
        req_snn = urllib.request.Request(
            f"{VERCEL_BASE}/api/snn/predict",
            data=json.dumps(snn_payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
            method="POST"
        )
        with urllib.request.urlopen(req_snn, timeout=25) as resp:
            snn_res = json.loads(resp.read().decode())
            print("[API] /api/snn/predict -> Status", resp.status, "Spikes:", snn_res.get("spike_counts"))
    except Exception as e:
        print("[API] /api/snn/predict -> FAILED:", e)

    print("\n" + "=" * 65)
    print("LIVE VERCEL DEPLOYMENT VERIFICATION COMPLETE!")
    print("=" * 65)

if __name__ == "__main__":
    test_vercel_dashboard()
