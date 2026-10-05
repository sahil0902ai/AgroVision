"""
Comprehensive 10-Case Validation Pass for AgroVision Smart Cotton Farming.
Validates all multi-modal edge cases, determinism of Expert Veto Engine,
CNN/SNN integration, and failure modes.
"""

import unittest
import io
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.fusion_engine import MultimodalFusionEngine, EvidenceRelationship
from app.services.expert_veto_rules import ExpertVetoRuleRegistry

class TestScreenCasesAndEdgeModes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.veto_registry = ExpertVetoRuleRegistry()
        # Create a valid test image in memory
        cls.test_img_bytes = io.BytesIO()
        img = Image.new("RGB", (224, 224), color=(34, 139, 34))
        img.save(cls.test_img_bytes, format="JPEG")
        cls.test_img_bytes = cls.test_img_bytes.getvalue()

    def test_case_1_healthy_low(self):
        """CASE 1: Healthy Visual + Low Environmental Stress -> Baseline Healthy"""
        visual = {"class": "Healthy", "confidence": 0.94, "probabilities": {"Healthy": 0.94, "Water Stress": 0.02}}
        env_evidence = {"severity": "Low", "confidence": 0.88, "spike_counts": {"Low": 8, "Moderate": 2, "High": 0}, "timesteps": 10}
        env_inputs = {"temperature": 28.0, "humidity": 65.0, "rainfall": 12.0, "soil_moisture": 0.65, "growth_stage": "Vegetative"}
        
        fused = MultimodalFusionEngine.fuse(visual, env_evidence, env_inputs)
        self.assertEqual(fused.relationship, EvidenceRelationship.BASELINE_HEALTHY)

    def test_case_2_healthy_high(self):
        """CASE 2: Healthy Visual + High Environmental Stress -> Conflicting / Latent Risk"""
        visual = {"class": "Healthy", "confidence": 0.91, "probabilities": {"Healthy": 0.91, "Water Stress": 0.04}}
        env_evidence = {"severity": "High", "confidence": 0.85, "spike_counts": {"Low": 1, "Moderate": 2, "High": 7}, "timesteps": 10}
        env_inputs = {"temperature": 39.5, "humidity": 30.0, "rainfall": 0.0, "soil_moisture": 0.22, "growth_stage": "Flowering"}
        
        fused = MultimodalFusionEngine.fuse(visual, env_evidence, env_inputs)
        self.assertIn(fused.relationship, [EvidenceRelationship.CONFLICTING, EvidenceRelationship.PARTIALLY_ALIGNED])

    def test_case_3_water_stress_high(self):
        """CASE 3: Water Stress Visual + High Environmental Stress -> Aligned Stress Confirmation"""
        visual = {"class": "Water Stress", "confidence": 0.89, "probabilities": {"Water Stress": 0.89, "Healthy": 0.05}}
        env_evidence = {"severity": "High", "confidence": 0.92, "spike_counts": {"Low": 0, "Moderate": 1, "High": 9}, "timesteps": 10}
        env_inputs = {"temperature": 37.0, "humidity": 35.0, "rainfall": 0.0, "soil_moisture": 0.20, "growth_stage": "Flowering"}
        
        fused = MultimodalFusionEngine.fuse(visual, env_evidence, env_inputs)
        self.assertEqual(fused.relationship, EvidenceRelationship.ALIGNED)

    def test_case_4_high_rainfall_high_soil_moisture(self):
        """CASE 4: High Rainfall + High Soil Moisture -> Waterlogging / EVR-001 Rule Check"""
        env_inputs = {"temperature": 26.0, "humidity": 95.0, "rainfall_mm": 120.0, "soil_moisture": 0.88, "growth_stage": "Vegetative"}
        cnn_probs = {"healthy": 90.0, "water_stress": 2.0}
        triggered = self.veto_registry.evaluate_rules(cnn_probs, "Low", env_inputs)
        rule_ids = [r["rule_id"] for r in triggered]
        self.assertIn("EVR-001", rule_ids)

    def test_case_5_high_temp_low_soil_moisture(self):
        """CASE 5: High Temperature + Low Soil Moisture -> Severe Heat & Drought / EVR-002 Check"""
        env_inputs = {"temperature": 42.0, "humidity": 20.0, "rainfall_mm": 0.0, "soil_moisture": 0.18, "growth_stage": "Flowering"}
        cnn_probs = {"healthy": 80.0, "heat_stress": 10.0}
        triggered = self.veto_registry.evaluate_rules(cnn_probs, "High", env_inputs)
        rule_ids = [r["rule_id"] for r in triggered]
        self.assertIn("EVR-002", rule_ids)

    def test_case_6_high_aqi_elevated_ozone(self):
        """CASE 6: High AQI + Elevated Ozone -> Pollution Stress / EVR-003 Check"""
        env_inputs = {"temperature": 30.0, "humidity": 60.0, "rainfall_mm": 5.0, "soil_moisture": 0.55, "aqi": 320.0, "ozone": 0.095}
        cnn_probs = {"healthy": 80.0, "pollution": 10.0}
        triggered = self.veto_registry.evaluate_rules(cnn_probs, "Moderate", env_inputs)
        rule_ids = [r["rule_id"] for r in triggered]
        self.assertIn("EVR-003", rule_ids)

    def test_case_7_multiple_expert_veto_rules(self):
        """CASE 7: Compound Stress Triggering Multiple Expert Rules Simultaneously"""
        env_inputs = {
            "temperature": 41.5,
            "humidity": 22.0,
            "rainfall_mm": 0.0,
            "soil_moisture": 0.15,
            "aqi": 280.0,
            "ozone": 0.090,
            "growth_stage": "Flowering"
        }
        cnn_probs = {"healthy": 70.0, "heat_stress": 20.0, "pollution": 10.0}
        triggered = self.veto_registry.evaluate_rules(cnn_probs, "High", env_inputs)
        self.assertGreaterEqual(len(triggered), 2)

    def test_case_8_missing_snn_input(self):
        """CASE 8: Missing required SNN parameters -> HTTP 422 Unprocessable Entity"""
        incomplete_payload = {"temperature": 32.0} # missing required features
        response = self.client.post("/api/snn/predict", json=incomplete_payload)
        self.assertEqual(response.status_code, 422)

    def test_case_9_cnn_failure_invalid_image(self):
        """CASE 9: Corrupted or non-image bytes -> HTTP 422 Unprocessable Entity"""
        response = self.client.post(
            "/api/cnn/predict",
            files={"file": ("fake.jpg", b"NOT_A_VALID_IMAGE_BYTES", "image/jpeg")}
        )
        self.assertIn(response.status_code, [400, 422])

    def test_case_10_snn_failure_extreme_malformed(self):
        """CASE 10: SNN failure on invalid data types -> HTTP 422 Unprocessable Entity"""
        malformed_payload = {"temperature": "VERY_HOT_STRING", "humidity": 50}
        response = self.client.post("/api/snn/predict", json=malformed_payload)
        self.assertEqual(response.status_code, 422)

if __name__ == "__main__":
    unittest.main()
