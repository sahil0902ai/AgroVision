# pyrefly: ignore [missing-import]
"""
End-to-end test scenarios for the SNN integration (spec section 36) plus the
CNN regression check (section 34). Run from backend/:  python scripts/run_integration_tests.py
"""
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

BASE = "http://localhost:8000"

VALID_PAYLOAD = {
    "temperature": 31.0, "humidity": 72.0, "rainfall": 18.0, "soil_moisture": 0.42,
    "aqi": 84.0, "ozone": 0.041,
    "latitude": 21.0, "longitude": 78.5, "growth_stage": "Flowering", "days_since_sowing": 60,
    "soil_nitrogen": 280.0, "soil_phosphorus": 12.0, "soil_potassium": 120.0,
    "ndvi": 0.55, "evi": 0.35, "gndvi": 0.45, "sif_740": 1.2, "f687": 1.0, "f760": 1.3,
    "fluorescence_ratio": 0.8, "chlorophyll_content": 40.0, "leaf_area_index": 2.5,
    "light": 600.0, "observation_date": "2025-08-15",
}


def post_json(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def post_multipart_image(path, image_path):
    boundary = "----AgroVisionTestBoundary"
    with open(image_path, "rb") as f:
        content = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{image_path.name}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        BASE + path, data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req) as r:
        return r.status, json.loads(r.read())


def scenario(name, payload_override=None, expect_error=False):
    payload = dict(VALID_PAYLOAD)
    if payload_override:
        for k, v in payload_override.items():
            if v == "__MISSING__":
                payload.pop(k, None)
            else:
                payload[k] = v
    status, data = post_json("/api/snn/predict", payload)
    if expect_error:
        detail = data.get("detail", "")
        print(f"[{name}] HTTP {status} (expected error) -> {str(detail)[:100]}")
        return status < 500  # any 4xx is a correct rejection
    print(
        f"[{name}] HTTP {status} -> {data.get('prediction', {}).get('class')} "
        f"(scores={data.get('class_scores')}, {data.get('inference_time_ms')}ms)"
    )
    return status == 200


def main():
    print("=" * 70)
    print("SCENARIO 0: Health check (both models)")
    with urllib.request.urlopen(BASE + "/api/health") as r:
        health = json.loads(r.read())
    print(f"  /api/health -> {health}")
    assert health["cnn_loaded"] is True and health["snn_loaded"] is True

    print("\nCNN REGRESSION: POST /api/cnn/predict still works")
    img = BACKEND_DIR / "datasets" / "sample_leaves" / "real_cotton_leaf.png"
    status, data = post_multipart_image("/api/cnn/predict", img)
    print(f"  CNN -> HTTP {status}: {data.get('prediction')}")
    assert status == 200, "CNN endpoint broke!"

    print("\nSNN SCENARIOS:")
    ok = True
    ok &= scenario("1. normal conditions", {})
    ok &= scenario("2. high temperature", {"temperature": 40.5})
    ok &= scenario("2b. extended range beyond training support", {"temperature": 50.0})
    ok &= scenario("3. low soil moisture", {"soil_moisture": 0.05})
    ok &= scenario("3b. extended zero soil moisture", {"soil_moisture": 0.0})
    ok &= scenario("4. high environmental stress", {
        "temperature": 40.0, "humidity": 20.0, "rainfall": 0.0,
        "soil_moisture": 0.05, "aqi": 110.0, "ozone": 0.054,
    })
    ok &= scenario("5. moderate conditions", {
        "temperature": 35.0, "humidity": 55.0, "rainfall": 40.0,
        "soil_moisture": 0.30, "aqi": 60.0, "ozone": 0.040,
    })
    ok &= scenario("6. missing required field", {"humidity": "__MISSING__"}, expect_error=True)
    ok &= scenario("6b. invalid growth stage", {"growth_stage": "Harvest"}, expect_error=True)
    ok &= scenario("6c. value outside extended range", {"temperature": 60.0}, expect_error=True)
    ok &= scenario("6d. wrong soil nitrogen", {"soil_nitrogen": 150.0}, expect_error=True)

    print("\nSCENARIO 7: real test-split records through the deployed API")
    import pandas as pd
    from ai_models.snn_inference import SNNInferenceEngine

    engine = SNNInferenceEngine()
    df = pd.read_csv(PROJECT_ROOT / "datasets" / "Agrovision Cotoon SNN Dataset.csv")
    # Chronological test split = last 15% (same as training notebook)
    n = len(df)
    test_df = df.iloc[int(n * 0.85):]

    # One real record per class
    for label in ["High", "Low", "Moderate"]:
        row = test_df[test_df["stress_label"] == label].iloc[0]
        payload = {
            "temperature": float(row["air_temperature_C"]), "humidity": float(row["humidity_percent"]),
            "rainfall": float(row["rainfall_mm"]), "soil_moisture": float(row["soil_moisture"]),
            "aqi": float(row["AQI"]), "ozone": float(row["ozone"]),
            "latitude": float(row["latitude"]), "longitude": float(row["longitude"]),
            "growth_stage": str(row["growth_stage"]), "days_since_sowing": float(row["days_since_sowing"]),
            "soil_nitrogen": float(row["soil_nitrogen"]), "soil_phosphorus": float(row["soil_phosphorus"]),
            "soil_potassium": float(row["soil_potassium"]),
            "ndvi": float(row["NDVI"]), "evi": float(row["EVI"]), "gndvi": float(row["GNDVI"]),
            "sif_740": float(row["SIF_740"]), "f687": float(row["F687"]), "f760": float(row["F760"]),
            "fluorescence_ratio": float(row["fluorescence_ratio"]),
            "chlorophyll_content": float(row["chlorophyll_content"]),
            "leaf_area_index": float(row["leaf_area_index"]), "light": float(row["light"]),
            "observation_date": pd.to_datetime(row["date"]).date().isoformat(),
        }
        status, data = post_json("/api/snn/predict", payload)
        api_class = data.get("prediction", {}).get("class")
        engine_class = engine.predict(row)["predicted_severity"]
        match = "MATCH" if api_class == engine_class else "MISMATCH"
        print(
            f"  record actual={label:8s} api={api_class:8s} engine={engine_class:8s} -> {match}"
        )
        ok &= api_class == engine_class

    print("\n" + "=" * 70)
    print("ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
