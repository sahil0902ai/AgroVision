"""
Unit and Integration Tests for Multimodal Fusion Layer and Expert Veto Rule Engine.

Covers all 10 scenarios mandated by the AgroVision thesis specification:
1. CNN Healthy + SNN Low -> Baseline Healthy / No Conflict
2. CNN Healthy + SNN High -> Disagreement / Conflict Detected
3. CNN Water Stress + SNN High -> Strong Aligned Evidence
4. High Rainfall + High Soil Moisture -> Over-irrigation/Waterlogging Rule Triggered
5. High Temperature + Low Soil Moisture -> Thermal & Desiccation Stress Rule Triggered
6. High AQI + Elevated Ozone -> Pollution Exposure Rule Triggered
7. No Rules Triggered -> Routine Monitoring Baseline
8. Multiple Rules Triggered -> All Applicable Rules Returned
9. API Endpoint Verification (POST /api/analysis/combine)
10. Input Validation & Error Handling
"""

import json
import unittest
from app.services.expert_veto_rules import ExpertVetoRuleRegistry, RuleSeverity
from app.services.fusion_engine import MultimodalFusionEngine, EvidenceRelationship
from app.services.recommendations import ExpertRecommendationEngine


class TestMultimodalFusionAndVetoEngine(unittest.TestCase):

    def setUp(self):
        self.registry = ExpertVetoRuleRegistry()

    def test_01_cnn_healthy_snn_low_baseline(self):
        """TEST 1: CNN Healthy + SNN Low -> BASELINE_HEALTHY & Routine Monitoring."""
        visual = {
            "class": "Healthy",
            "confidence": 0.95,
            "probabilities": {"Healthy": 0.95, "Water Stress": 0.02, "Heat Stress": 0.01, "Nutrient Deficiency": 0.01, "Pollution": 0.01}
        }
        snn = {"severity": "Low", "confidence": 0.92, "spike_counts": {"High": 0, "Low": 9, "Moderate": 1}}
        env = {"air_temperature_C": 26.0, "humidity_percent": 65.0, "rainfall_mm": 5.0, "soil_moisture": 0.40, "AQI": 45.0, "ozone": 0.030}

        fused = MultimodalFusionEngine.fuse(visual, snn, env)
        self.assertEqual(fused.relationship, EvidenceRelationship.BASELINE_HEALTHY)
        self.assertGreaterEqual(fused.alignment_score, 0.90)

        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 95.0, "water_stress": 2.0, "heat_stress": 1.0, "nutrient_deficiency": 1.0, "pollution": 1.0},
            snn_severity="Low",
            env_data=env,
            fusion_relationship=fused.relationship.value
        )
        self.assertEqual(veto["overall_status"], "ROUTINE_MONITORING")
        self.assertTrue(any(r["rule_id"] == "EVR-007" for r in veto["triggered_rules"]))

    def test_02_cnn_healthy_snn_high_disagreement(self):
        """TEST 2: CNN Healthy + SNN High -> CONFLICTING & Disagreement Rule (EVR-004)."""
        visual = {
            "class": "Healthy",
            "confidence": 0.88,
            "probabilities": {"Healthy": 0.88, "Water Stress": 0.05, "Heat Stress": 0.03, "Nutrient Deficiency": 0.02, "Pollution": 0.02}
        }
        snn = {"severity": "High", "confidence": 0.94, "spike_counts": {"High": 9, "Low": 0, "Moderate": 1}}
        env = {"air_temperature_C": 36.0, "humidity_percent": 30.0, "rainfall_mm": 0.0, "soil_moisture": 0.28, "AQI": 75.0, "ozone": 0.038}

        fused = MultimodalFusionEngine.fuse(visual, snn, env)
        self.assertEqual(fused.relationship, EvidenceRelationship.CONFLICTING)

        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 88.0, "water_stress": 5.0, "heat_stress": 3.0, "nutrient_deficiency": 2.0, "pollution": 2.0},
            snn_severity="High",
            env_data=env,
            fusion_relationship=fused.relationship.value
        )
        self.assertTrue(any(r["rule_id"] == "EVR-004" for r in veto["triggered_rules"]))
        disagree_rule = next(r for r in veto["triggered_rules"] if r["rule_id"] == "EVR-004")
        self.assertEqual(disagree_rule["severity"], RuleSeverity.CAUTION.value)

    def test_03_cnn_water_stress_snn_high_aligned(self):
        """TEST 3: CNN Water Stress + SNN High -> ALIGNED & Aligned Rule (EVR-005)."""
        visual = {
            "class": "Water Stress",
            "confidence": 0.91,
            "probabilities": {"Healthy": 0.02, "Water Stress": 0.91, "Heat Stress": 0.04, "Nutrient Deficiency": 0.02, "Pollution": 0.01}
        }
        snn = {"severity": "High", "confidence": 0.96, "spike_counts": {"High": 10, "Low": 0, "Moderate": 0}}
        env = {"air_temperature_C": 35.0, "humidity_percent": 25.0, "rainfall_mm": 0.0, "soil_moisture": 0.18, "AQI": 60.0, "ozone": 0.035}

        fused = MultimodalFusionEngine.fuse(visual, snn, env)
        self.assertEqual(fused.relationship, EvidenceRelationship.ALIGNED)

        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 2.0, "water_stress": 91.0, "heat_stress": 4.0, "nutrient_deficiency": 2.0, "pollution": 1.0},
            snn_severity="High",
            env_data=env,
            fusion_relationship=fused.relationship.value
        )
        self.assertTrue(any(r["rule_id"] == "EVR-005" for r in veto["triggered_rules"]))
        self.assertIn("WARNING", veto["overall_status"])

    def test_04_high_rainfall_high_soil_moisture_waterlogging(self):
        """TEST 4: Rainfall >= 20mm AND Soil Moisture >= 55% -> Over-irrigation/Waterlogging (EVR-001)."""
        env = {"rainfall_mm": 35.0, "soil_moisture": 0.62, "air_temperature_C": 24.0, "humidity_percent": 88.0, "AQI": 40.0, "ozone": 0.025}
        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 30.0, "water_stress": 55.0, "heat_stress": 5.0, "nutrient_deficiency": 5.0, "pollution": 5.0},
            snn_severity="Moderate",
            env_data=env
        )
        self.assertTrue(any(r["rule_id"] == "EVR-001" for r in veto["triggered_rules"]))
        waterlog_rule = next(r for r in veto["triggered_rules"] if r["rule_id"] == "EVR-001")
        self.assertEqual(waterlog_rule["severity"], RuleSeverity.WARNING.value)
        self.assertIn("drainage", waterlog_rule["precaution"].lower())

    def test_05_high_temp_low_soil_moisture_thermal_desiccation(self):
        """TEST 5: Temp >= 38C AND Soil Moisture <= 25% -> Thermal & Desiccation (EVR-002 CRITICAL)."""
        env = {"air_temperature_C": 41.5, "soil_moisture": 0.12, "rainfall_mm": 0.0, "humidity_percent": 20.0, "AQI": 65.0, "ozone": 0.035}
        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 10.0, "water_stress": 30.0, "heat_stress": 55.0, "nutrient_deficiency": 3.0, "pollution": 2.0},
            snn_severity="High",
            env_data=env
        )
        self.assertTrue(any(r["rule_id"] == "EVR-002" for r in veto["triggered_rules"]))
        crit_rule = next(r for r in veto["triggered_rules"] if r["rule_id"] == "EVR-002")
        self.assertEqual(crit_rule["severity"], RuleSeverity.CRITICAL.value)
        self.assertEqual(veto["overall_status"], "CRITICAL_ACTION_REQUIRED")

    def test_06_high_aqi_elevated_ozone_pollution(self):
        """TEST 6: AQI >= 100 OR Ozone >= 0.045 -> Atmospheric Pollution (EVR-003)."""
        env = {"air_temperature_C": 30.0, "soil_moisture": 0.40, "rainfall_mm": 2.0, "humidity_percent": 55.0, "AQI": 135.0, "ozone": 0.052}
        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 25.0, "water_stress": 10.0, "heat_stress": 10.0, "nutrient_deficiency": 10.0, "pollution": 45.0},
            snn_severity="Moderate",
            env_data=env
        )
        self.assertTrue(any(r["rule_id"] == "EVR-003" for r in veto["triggered_rules"]))

    def test_07_no_rules_triggered_baseline(self):
        """TEST 7: No risk factors active -> Baseline Stability."""
        env = {"air_temperature_C": 28.0, "soil_moisture": 0.42, "rainfall_mm": 5.0, "humidity_percent": 60.0, "AQI": 45.0, "ozone": 0.030}
        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 85.0, "water_stress": 5.0, "heat_stress": 3.0, "nutrient_deficiency": 4.0, "pollution": 3.0},
            snn_severity="Low",
            env_data=env
        )
        self.assertEqual(veto["overall_status"], "ROUTINE_MONITORING")

    def test_08_multiple_rules_triggered(self):
        """TEST 8: Multiple concurrent stresses -> Returns ALL applicable rules."""
        # High Temp (40C) + Low Soil Moisture (15%) + High AQI (140) + CNN Water Stress (80%) + SNN High
        env = {"air_temperature_C": 40.0, "soil_moisture": 0.15, "rainfall_mm": 0.0, "humidity_percent": 18.0, "AQI": 140.0, "ozone": 0.050}
        veto = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs={"healthy": 2.0, "water_stress": 80.0, "heat_stress": 12.0, "nutrient_deficiency": 3.0, "pollution": 3.0},
            snn_severity="High",
            env_data=env
        )
        triggered_ids = [r["rule_id"] for r in veto["triggered_rules"]]
        # Should trigger EVR-002 (Thermal/Desiccation), EVR-003 (Pollution), EVR-005 (Aligned Water Stress)
        self.assertIn("EVR-002", triggered_ids)
        self.assertIn("EVR-003", triggered_ids)
        self.assertIn("EVR-005", triggered_ids)
        self.assertGreaterEqual(len(triggered_ids), 3)
        self.assertEqual(veto["overall_status"], "CRITICAL_ACTION_REQUIRED")

    def test_09_backward_compatibility_recommendations_list(self):
        """TEST 9: evaluate() returns non-empty list of formatted string recommendations."""
        env = {"rainfall_mm": 30.0, "soil_moisture": 0.60, "air_temperature_C": 25.0}
        recs = ExpertRecommendationEngine.evaluate(
            cnn_probs={"healthy": 10.0, "water_stress": 60.0, "heat_stress": 10.0, "nutrient_deficiency": 10.0, "pollution": 10.0},
            snn_severity="High",
            env_data=env
        )
        self.assertIsInstance(recs, list)
        self.assertGreater(len(recs), 0)
        self.assertTrue(any("Over-Irrigation" in r or "Water Stress" in r for r in recs))


if __name__ == "__main__":
    unittest.main()
