"""
AgroVision Comprehensive Test Suite for Cotton Leaf Validation & Real CNN Analysis.
Tests:
- Group A: Valid Cotton Leaves across 5 classes (Healthy, Water Stress, Heat Stress, Nutrient Deficiency, Pollution)
- Group B: Invalid Images (Car, Person, Animal, Building, Landscape, Screenshot, Document, Unrelated Object, Non-Cotton Leaf, Another Crop Leaf, Blank, Blurred, Corrupted, Unsupported Format)
- Group C: Consecutive Uploads & Inference Independence (Session UUID uniqueness, prediction variability across classes, no state leakage)
- Group D: Error Handling & System Integrity (Fail-closed behavior, invalid payloads, missing inputs)
"""

import os
import sys
import unittest
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient

# Add project root to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))

from app.main import app
from app.services.cotton_leaf_gate import CottonLeafGate, validate_cotton_leaf_image
from app.services.cnn_service import CNNService

TEST_ASSETS_DIR = os.path.join(BASE_DIR, "tests", "test_assets")


class TestCottonValidationAndCNNPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.gate = CottonLeafGate.get_instance()
        cls.cnn_service = CNNService.get_instance()

    # =========================================================
    # TEST GROUP A — Valid Cotton Leaf Images (5 Classes)
    # =========================================================

    def test_group_a_01_healthy_cotton_leaf(self):
        """Group A: Healthy Cotton Leaf passes gate and undergoes authentic CNN inference."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_healthy.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()

        # Gate verification
        is_valid, cat, msg, diag = self.gate.validate(img_bytes)
        self.assertTrue(is_valid, f"Healthy cotton leaf should pass gate: {msg}")
        self.assertEqual(cat, "VALID_COTTON_LEAF")

        # Full pipeline endpoint verification
        files = {"file": ("healthy.jpg", img_bytes, "image/jpeg")}
        data = {
            "temperature": "30.0",
            "humidity": "65.0",
            "soil_moisture": "0.55",
            "rainfall_mm": "5.0",
            "aqi": "50.0",
            "ozone": "0.035"
        }
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 200, f"Analysis failed: {res.text}")
        json_data = res.json()
        self.assertEqual(json_data["cnn"]["predicted_class"], "Healthy")
        self.assertGreater(json_data["cnn"]["confidence"], 0.70)
        self.assertEqual(len(json_data["cnn"]["probabilities"]), 5)

    def test_group_a_02_water_stress_cotton_leaf(self):
        """Group A: Water Stress Cotton Leaf passes gate and undergoes authentic CNN inference."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_water_stress.png")
        with open(p, "rb") as f:
            img_bytes = f.read()

        is_valid, cat, msg, diag = self.gate.validate(img_bytes)
        self.assertTrue(is_valid, f"Water stress leaf should pass gate: {msg}")
        self.assertEqual(cat, "VALID_COTTON_LEAF")

        files = {"file": ("water_stress.png", img_bytes, "image/png")}
        data = {"temperature": "35.0", "humidity": "40.0", "soil_moisture": "0.20", "rainfall_mm": "0.0"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 200)
        json_data = res.json()
        self.assertEqual(len(json_data["cnn"]["probabilities"]), 5)
        self.assertIn("Water Stress", json_data["cnn"]["probabilities"])

    def test_group_a_03_heat_stress_cotton_leaf(self):
        """Group A: Heat Stress Cotton Leaf passes gate and undergoes authentic CNN inference."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_heat_stress.png")
        with open(p, "rb") as f:
            img_bytes = f.read()

        is_valid, cat, msg, diag = self.gate.validate(img_bytes)
        self.assertTrue(is_valid, f"Heat stress leaf should pass gate: {msg}")
        self.assertEqual(cat, "VALID_COTTON_LEAF")

        files = {"file": ("heat_stress.png", img_bytes, "image/png")}
        data = {"temperature": "42.0", "humidity": "25.0", "soil_moisture": "0.18", "rainfall_mm": "0.0"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 200)
        json_data = res.json()
        self.assertEqual(len(json_data["cnn"]["probabilities"]), 5)

    def test_group_a_04_nutrient_deficiency_cotton_leaf(self):
        """Group A: Nutrient Deficiency Cotton Leaf passes gate and undergoes authentic CNN inference."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_nutrient_deficiency.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()

        is_valid, cat, msg, diag = self.gate.validate(img_bytes)
        self.assertTrue(is_valid, f"Nutrient deficiency leaf should pass gate: {msg}")
        self.assertEqual(cat, "VALID_COTTON_LEAF")

        files = {"file": ("nutrient.jpg", img_bytes, "image/jpeg")}
        data = {"temperature": "31.0", "humidity": "60.0", "soil_moisture": "0.50"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 200)
        json_data = res.json()
        self.assertEqual(len(json_data["cnn"]["probabilities"]), 5)

    def test_group_a_05_pollution_cotton_leaf(self):
        """Group A: Pollution Stressed Cotton Leaf passes gate and undergoes authentic CNN inference."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_pollution.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()

        is_valid, cat, msg, diag = self.gate.validate(img_bytes)
        self.assertTrue(is_valid, f"Pollution leaf should pass gate: {msg}")
        self.assertEqual(cat, "VALID_COTTON_LEAF")

        files = {"file": ("pollution.jpg", img_bytes, "image/jpeg")}
        data = {"temperature": "28.0", "humidity": "65.0", "soil_moisture": "0.50", "aqi": "280.0", "ozone": "0.085"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 200)
        json_data = res.json()
        self.assertEqual(len(json_data["cnn"]["probabilities"]), 5)

    # =========================================================
    # TEST GROUP B — Invalid Images (Must be Rejected)
    # =========================================================

    def _assert_image_rejected(self, filename, expected_substring):
        p = os.path.join(TEST_ASSETS_DIR, filename)
        with open(p, "rb") as f:
            img_bytes = f.read()

        files = {"file": (filename, img_bytes, "image/jpeg" if not filename.endswith(".png") else "image/png")}
        data = {"temperature": "30.0", "humidity": "65.0", "soil_moisture": "0.50"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 400, f"Expected 400 rejection for {filename}, got {res.status_code}")
        err_msg = res.json().get("detail", "")
        self.assertIn(expected_substring.lower(), err_msg.lower(), f"Unexpected error message: {err_msg}")

    def test_group_b_01_car_photograph(self):
        """Group B: Car photograph is rejected as unrelated non-cotton image."""
        self._assert_image_rejected("group_b_car.jpg", "not appear to contain a cotton leaf")

    def test_group_b_02_human_photograph(self):
        """Group B: Human photograph is rejected as unrelated image."""
        self._assert_image_rejected("group_b_person.jpg", "not appear to contain a cotton leaf")

    def test_group_b_03_animal_photograph(self):
        """Group B: Animal photograph is rejected as unrelated image."""
        self._assert_image_rejected("group_b_animal.jpg", "not appear to contain a cotton leaf")

    def test_group_b_04_building_photograph(self):
        """Group B: Building photograph is rejected as unrelated image."""
        self._assert_image_rejected("group_b_building.jpg", "not appear to contain a cotton leaf")

    def test_group_b_05_landscape_photograph(self):
        """Group B: Landscape photograph is rejected as unrelated image."""
        self._assert_image_rejected("group_b_landscape.jpg", "not appear to contain a cotton leaf")

    def test_group_b_06_screenshot(self):
        """Group B: Computer/mobile screenshot is rejected as unrelated image."""
        self._assert_image_rejected("group_b_screenshot.png", "not appear to contain a cotton leaf")

    def test_group_b_07_document(self):
        """Group B: Document/invoice image is rejected as unrelated image."""
        self._assert_image_rejected("group_b_document.png", "not appear to contain a cotton leaf")

    def test_group_b_08_unrelated_object(self):
        """Group B: Random household object is rejected."""
        self._assert_image_rejected("group_b_unrelated_object.jpg", "not appear to contain a cotton leaf")

    def test_group_b_09_non_cotton_plant_leaf(self):
        """Group B: Non-cotton plant leaf is rejected with Unsupported Plant guidance."""
        self._assert_image_rejected("group_b_non_cotton_leaf.jpg", "analyses cotton leaves only")

    def test_group_b_10_another_crop_leaf(self):
        """Group B: Another crop's leaf is rejected without generating cotton stress prediction."""
        p = os.path.join(TEST_ASSETS_DIR, "group_b_another_crop_leaf.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()
        files = {"file": ("another_crop.jpg", img_bytes, "image/jpeg")}
        data = {"temperature": "30.0", "humidity": "65.0", "soil_moisture": "0.50"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 400)

    def test_group_b_11_blank_image(self):
        """Group B: Blank single-color image is rejected as low quality."""
        self._assert_image_rejected("group_b_blank.jpg", "image quality too low")

    def test_group_b_12_severely_blurred_image(self):
        """Group B: Severely blurred image is rejected as low quality."""
        self._assert_image_rejected("group_b_blurred.jpg", "image quality too low")

    def test_group_b_13_corrupted_file(self):
        """Group B: Corrupted non-image file is rejected cleanly."""
        self._assert_image_rejected("group_b_corrupted.bin", "unable to process image")

    def test_group_b_14_unsupported_format(self):
        """Group B: Unsupported plain text file is rejected cleanly."""
        p = os.path.join(TEST_ASSETS_DIR, "group_b_unsupported.txt")
        with open(p, "rb") as f:
            data_bytes = f.read()
        files = {"file": ("unsupported.txt", data_bytes, "text/plain")}
        res = self.client.post("/api/analysis", files=files, data={"temperature": "30.0", "humidity": "65.0", "soil_moisture": "0.50"})
        self.assertEqual(res.status_code, 400)

    # =========================================================
    # TEST GROUP C — Consecutive Uploads & Inference Independence
    # =========================================================

    def test_group_c_consecutive_uploads_independent(self):
        """Group C: Consecutive uploads of different valid leaves produce distinct UUIDs and predictions."""
        samples = [
            ("group_a_healthy.jpg", "image/jpeg"),
            ("group_a_water_stress.png", "image/png"),
            ("group_a_nutrient_deficiency.jpg", "image/jpeg")
        ]

        seen_uuids = set()
        seen_predictions = []

        for fname, mime in samples:
            p = os.path.join(TEST_ASSETS_DIR, fname)
            with open(p, "rb") as f:
                img_bytes = f.read()

            files = {"file": (fname, img_bytes, mime)}
            data = {"temperature": "31.0", "humidity": "62.0", "soil_moisture": "0.48"}
            res = self.client.post("/api/analysis", files=files, data=data)
            self.assertEqual(res.status_code, 200)
            res_json = res.json()

            uuid_val = res_json.get("record_uuid")
            self.assertNotIn(uuid_val, seen_uuids, "Every analysis session must generate a unique UUID")
            seen_uuids.add(uuid_val)

            top_class = res_json["cnn"]["predicted_class"]
            seen_predictions.append(top_class)

        # Confirm different images produce distinct predictions
        self.assertGreater(len(set(seen_predictions)), 1, "Different leaf images must produce distinct visual predictions")

    # =========================================================
    # TEST GROUP D — Error Handling & Fail-Closed Behavior
    # =========================================================

    def test_group_d_01_empty_image_rejected(self):
        """Group D: Zero-byte image upload is rejected with HTTP 400."""
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        res = self.client.post("/api/analysis", files=files, data={"temperature": "30.0", "humidity": "65.0", "soil_moisture": "0.50"})
        self.assertEqual(res.status_code, 400)

    def test_group_d_02_out_of_bounds_telemetry(self):
        """Group D: Physically impossible temperature is rejected with HTTP 422."""
        p = os.path.join(TEST_ASSETS_DIR, "group_a_healthy.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()
        files = {"file": ("healthy.jpg", img_bytes, "image/jpeg")}
        # 120°C air temperature is outside agricultural physical bounds
        data = {"temperature": "120.0", "humidity": "65.0", "soil_moisture": "0.50"}
        res = self.client.post("/api/analysis", files=files, data=data)
        self.assertEqual(res.status_code, 422)

    def test_group_d_03_cnn_endpoint_rejects_car(self):
        """Group D: Dedicated /api/cnn/predict also enforces gate and rejects car photo."""
        p = os.path.join(TEST_ASSETS_DIR, "group_b_car.jpg")
        with open(p, "rb") as f:
            img_bytes = f.read()
        res = self.client.post("/api/cnn/predict", files={"file": ("car.jpg", img_bytes, "image/jpeg")})
        self.assertEqual(res.status_code, 400)
        self.assertIn("not appear to contain a cotton leaf", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
