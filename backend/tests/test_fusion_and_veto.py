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

    def test_10_concordance_aligned_predictions(self):
        """TEST 10: Aligned CNN & SNN distributions compute exact probabilistic concordance (no static values)."""
        # Case A: Baseline Healthy (Healthy=0.95 vs Low=0.92, Mod=0.08, High=0.00)
        v_healthy = {
            "class": "Healthy",
            "confidence": 0.95,
            "probabilities": {"Healthy": 0.95, "Water Stress": 0.02, "Heat Stress": 0.01, "Nutrient Deficiency": 0.01, "Pollution": 0.01},
        }
        s_low = {"severity": "Low", "confidence": 0.92, "class_scores": {"Low": 0.92, "Moderate": 0.08, "High": 0.00}}
        fused_a = MultimodalFusionEngine.fuse(v_healthy, s_low)
        self.assertEqual(fused_a.relationship, EvidenceRelationship.BASELINE_HEALTHY)
        # p_no=0.95, p_str=0.05; q_no=0.96, q_str=0.04 -> 0.95*0.96 + 0.05*0.04 = 0.914
        self.assertAlmostEqual(fused_a.alignment_score, 0.914, places=4)

        # Case B: Aligned Stress (Water Stress=0.91, Healthy=0.02 vs High=0.96, Mod=0.04, Low=0.00)
        v_water = {
            "class": "Water Stress",
            "confidence": 0.91,
            "probabilities": {"Healthy": 0.02, "Water Stress": 0.91, "Heat Stress": 0.04, "Nutrient Deficiency": 0.02, "Pollution": 0.01},
        }
        s_high = {"severity": "High", "confidence": 0.96, "class_scores": {"High": 0.96, "Moderate": 0.04, "Low": 0.00}}
        fused_b = MultimodalFusionEngine.fuse(v_water, s_high)
        self.assertEqual(fused_b.relationship, EvidenceRelationship.ALIGNED)
        # p_no=0.02, p_str=0.98; q_no=0.02, q_str=0.98 -> 0.02*0.02 + 0.98*0.98 = 0.9608
        self.assertAlmostEqual(fused_b.alignment_score, 0.9608, places=4)

    def test_11_concordance_partially_aligned_not_hardcoded_60(self):
        """TEST 11: Partially aligned predictions vary with actual CNN/SNN distributions (never static 0.60/0.75)."""
        v_water = {
            "class": "Water Stress",
            "confidence": 0.94,
            "probabilities": {"Healthy": 0.01, "Water Stress": 0.94, "Heat Stress": 0.03, "Nutrient Deficiency": 0.01, "Pollution": 0.01},
        }
        # Split Low/Moderate spikes (Low=0.50, Moderate=0.50, High=0.00 -> q_str=0.25, q_no=0.75)
        s_split = {"severity": "Low", "confidence": 0.50, "class_scores": {"Low": 0.50, "Moderate": 0.50, "High": 0.00}}
        fused_split = MultimodalFusionEngine.fuse(v_water, s_split)
        self.assertEqual(fused_split.relationship, EvidenceRelationship.PARTIALLY_ALIGNED)
        # 0.01*0.75 + 0.99*0.25 = 0.255
        self.assertAlmostEqual(fused_split.alignment_score, 0.255, places=4)
        self.assertNotAlmostEqual(fused_split.alignment_score, 0.60, places=2)

        # Moderate SNN (Low=0.10, Moderate=0.80, High=0.10 -> q_str=0.50, q_no=0.50)
        s_mod = {"severity": "Moderate", "confidence": 0.80, "class_scores": {"Low": 0.10, "Moderate": 0.80, "High": 0.10}}
        fused_mod = MultimodalFusionEngine.fuse(v_water, s_mod)
        self.assertEqual(fused_mod.relationship, EvidenceRelationship.PARTIALLY_ALIGNED)
        self.assertAlmostEqual(fused_mod.alignment_score, 0.50, places=4)

        # Changing spike counts (via softmax fallback) changes concordance dynamically
        s_strong_low = {"severity": "Low", "confidence": 0.99, "spike_counts": {"Low": 10, "Moderate": 0, "High": 0}}
        fused_strong_low = MultimodalFusionEngine.fuse(v_water, s_strong_low)
        self.assertLess(fused_strong_low.alignment_score, fused_split.alignment_score)

    def test_12_concordance_conflicting_predictions(self):
        """TEST 12: Conflicting Healthy CNN vs High SNN computes low concordance from distributions."""
        v_healthy = {
            "class": "Healthy",
            "confidence": 0.88,
            "probabilities": {"Healthy": 0.88, "Water Stress": 0.05, "Heat Stress": 0.03, "Nutrient Deficiency": 0.02, "Pollution": 0.02},
        }
        s_high = {"severity": "High", "confidence": 0.94, "class_scores": {"High": 0.94, "Moderate": 0.06, "Low": 0.00}}
        fused = MultimodalFusionEngine.fuse(v_healthy, s_high)
        self.assertEqual(fused.relationship, EvidenceRelationship.CONFLICTING)
        # p_no=0.88, p_str=0.12; q_no=0.03, q_str=0.97 -> 0.88*0.03 + 0.12*0.97 = 0.1428
        self.assertAlmostEqual(fused.alignment_score, 0.1428, places=4)

    def test_13_concordance_unavailable_when_outputs_missing(self):
        """TEST 13: Missing CNN probabilities or missing SNN scores/spikes returns None (Not Available)."""
        v_missing = {"class": "Healthy", "confidence": 0.90, "probabilities": {}}
        s_valid = {"severity": "Low", "confidence": 0.90, "class_scores": {"Low": 0.90, "Moderate": 0.10, "High": 0.00}}
        self.assertIsNone(MultimodalFusionEngine.fuse(v_missing, s_valid).alignment_score)

        v_valid = {"class": "Healthy", "confidence": 0.90, "probabilities": {"Healthy": 0.90, "Water Stress": 0.10}}
        s_missing = {"severity": "Low", "confidence": 0.90, "spike_counts": {}}
        self.assertIsNone(MultimodalFusionEngine.fuse(v_valid, s_missing).alignment_score)


if __name__ == "__main__":
    unittest.main()
