"""
AgroVision Expert Veto Rule Engine Configuration & Rule Definitions.

Provides deterministic, rule-based agronomic qualification and precautionary
decision support over fused visual (CNN) and environmental (SNN) evidence.

IMPORTANT: All numeric thresholds in this module are illustrative decision-support
thresholds derived from the AgroVision thesis architecture scenarios. They require
local agronomic calibration before operational field deployment.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RuleSeverity(str, Enum):
    INFO = "INFO"
    CAUTION = "CAUTION"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class ExpertRule:
    rule_id: str
    name: str
    severity: RuleSeverity
    condition_description: str
    interpretation: str
    precaution: str
    rationale: str
    threshold_status: str = "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION"
    enabled: bool = True
    parameters: dict[str, Any] = field(default_factory=dict)


# Default configurable threshold parameters
DEFAULT_THRESHOLDS = {
    "rainfall_high_mm": 20.0,
    "soil_moisture_high_pct": 55.0,
    "soil_moisture_low_pct": 25.0,
    "temp_heat_stress_c": 38.0,
    "aqi_elevated": 100.0,
    "ozone_elevated": 0.045,
    "cnn_water_stress_min_pct": 40.0,
    "cnn_heat_stress_min_pct": 35.0,
    "cnn_nutrient_min_pct": 30.0,
    "cnn_pollution_min_pct": 25.0,
    "cnn_healthy_min_pct": 60.0,
}


class ExpertVetoRuleRegistry:
    """Registry and evaluator of deterministic Expert Veto rules."""

    def __init__(self, thresholds: dict[str, Any] | None = None):
        self.thresholds = dict(DEFAULT_THRESHOLDS)
        if thresholds:
            self.thresholds.update(thresholds)

    def evaluate_rules(
        self,
        cnn_probs: dict[str, float],
        snn_severity: str,
        env_data: dict[str, Any],
        fusion_relationship: str = "INCONCLUSIVE",
    ) -> list[dict[str, Any]]:
        """
        Evaluates all active rules against the multi-modal evidence.
        Returns all matching rules with their severity, interpretation, and precaution.
        """
        triggered_rules: list[dict[str, Any]] = []

        # Extract normalized CNN percentages (0.0 to 100.0)
        water_val = cnn_probs.get("water_stress", 0.0)
        heat_val = cnn_probs.get("heat_stress", 0.0)
        nutrient_val = cnn_probs.get("nutrient_deficiency", 0.0)
        pollution_val = cnn_probs.get("pollution", 0.0)
        healthy_val = cnn_probs.get("healthy", 0.0)

        # Extract environmental parameters
        rainfall = float(env_data.get("rainfall_mm", env_data.get("rainfall", 0.0)))
        raw_sm = float(env_data.get("soil_moisture", 0.35))
        # Support volumetric m³/m³ (e.g. 0.35) or percentage (35.0%)
        sm_pct = raw_sm * 100.0 if raw_sm <= 1.0 else raw_sm
        temp = float(env_data.get("air_temperature_C", env_data.get("temperature", 28.0)))
        aqi = float(env_data.get("AQI", env_data.get("aqi", 50.0)))
        ozone = float(env_data.get("ozone", 0.035))

        t = self.thresholds

        # -------------------------------------------------------------
        # RULE 1: Over-Irrigation / Waterlogging Risk
        # -------------------------------------------------------------
        if rainfall >= t["rainfall_high_mm"] and sm_pct >= t["soil_moisture_high_pct"]:
            triggered_rules.append({
                "rule_id": "EVR-001",
                "name": "Over-Irrigation / Waterlogging Risk",
                "severity": RuleSeverity.WARNING.value,
                "rule_status": "High Environmental Risk",
                "condition": f"Rainfall ({rainfall:.1f} mm) >= {t['rainfall_high_mm']} mm AND Soil Moisture ({sm_pct:.1f}%) >= {t['soil_moisture_high_pct']}%",
                "reason": "High soil moisture combined with significant rainfall forecast creates elevated risk of root hypoxia, waterlogging, and nutrient leaching.",
                "interpretation": "High soil moisture combined with significant rainfall forecast creates elevated risk of root hypoxia, waterlogging, and nutrient leaching.",
                "impact": "Saturated soil limits oxygen availability to cotton taproots, reducing nutrient uptake and increasing vulnerability to fungal root rots.",
                "precaution": "Temporarily halt planned irrigation cycles and inspect field drainage channels to prevent root zone saturation.",
                "what_to_check": "Inspect field drainage furrows, verify root zone oxygenation, and check lower canopy leaves for anaerobic yellowing.",
                "rationale": "Saturated soil limits oxygen availability to cotton taproots, increasing vulnerability to fungal root rots.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 2: Thermal & Desiccation Stress Risk
        # -------------------------------------------------------------
        if temp >= t["temp_heat_stress_c"] and sm_pct <= t["soil_moisture_low_pct"]:
            triggered_rules.append({
                "rule_id": "EVR-002",
                "name": "Thermal & Desiccation Stress Risk",
                "severity": RuleSeverity.CRITICAL.value,
                "rule_status": "High Environmental Risk",
                "condition": f"Air Temp ({temp:.1f}°C) >= {t['temp_heat_stress_c']}°C AND Soil Moisture ({sm_pct:.1f}%) <= {t['soil_moisture_low_pct']}%",
                "reason": "High ambient temperatures combined with depleted soil moisture cause severe canopy transpiration deficit.",
                "interpretation": "High ambient temperatures combined with depleted soil moisture cause severe canopy transpiration deficit.",
                "impact": "High vapor pressure deficit under moisture-depleted conditions leads to stomatal closure, square and flower bud shedding, and stunted boll development.",
                "precaution": "Schedule immediate drip or furrow irrigation during early morning or late evening; inspect canopy for irreversible wilting.",
                "what_to_check": "Confirm root zone soil moisture depth (15cm and 30cm), inspect terminal squares/bolls for shedding, and check for midday leaf flagging.",
                "rationale": "High vapor pressure deficit under moisture-depleted conditions leads to stomatal closure, flower bud shedding, and stunted boll development.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 3: Atmospheric Pollution & Ozone Exposure Risk
        # -------------------------------------------------------------
        if aqi >= t["aqi_elevated"] or ozone >= t["ozone_elevated"] or pollution_val >= t["cnn_pollution_min_pct"]:
            triggered_rules.append({
                "rule_id": "EVR-003",
                "name": "Atmospheric Pollution & Ozone Exposure Risk",
                "severity": RuleSeverity.CAUTION.value,
                "rule_status": "Precaution Detected",
                "condition": f"AQI ({aqi:.0f}) >= {t['aqi_elevated']} OR Ozone ({ozone:.3f}) >= {t['ozone_elevated']} OR Visual Pollution ({pollution_val:.1f}%) >= {t['cnn_pollution_min_pct']}%",
                "reason": "Elevated particulate pollution or tropospheric ozone detected, posing a risk of foliar flecking and reduced photosynthetic efficiency.",
                "interpretation": "Elevated particulate pollution or tropospheric ozone detected, posing a risk of foliar flecking and reduced photosynthetic efficiency.",
                "impact": "Particulate accumulation on the leaf surface obstructs stomata and reduces photosynthetically active radiation (PAR) absorption.",
                "precaution": "Monitor canopy for necrotic speckling; consider overhead sprinkler washing if heavy particulate dust coats the leaf surface.",
                "what_to_check": "Inspect upper leaf surfaces for particulate film, monitor stomatal conductance, and check for upper-canopy bronzing or speckling.",
                "rationale": "Particulate accumulation on the leaf surface obstructs stomata and reduces photosynthetically active radiation (PAR) absorption.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 4: Model Conflict / Disagreement Inspection
        # -------------------------------------------------------------
        if healthy_val >= t["cnn_healthy_min_pct"] and snn_severity == "High":
            triggered_rules.append({
                "rule_id": "EVR-004",
                "name": "Visual/Environmental Evidence Disagreement",
                "severity": RuleSeverity.CAUTION.value,
                "rule_status": "Evidence Conflict",
                "condition": f"CNN Visual Healthy ({healthy_val:.1f}%) >= {t['cnn_healthy_min_pct']}% BUT SNN Environmental Stress is HIGH",
                "reason": "Visual and environmental signals do not fully agree. Leaf appears asymptomatic, but environmental conditions are unfavorable.",
                "interpretation": "Disagreement between visual appearance and environmental stress risk. Leaf appears asymptomatic, but environmental conditions are unfavorable.",
                "impact": "Additional evidence should be reviewed before interpreting the result. Characteristic of pre-symptomatic stress or localized field variation.",
                "precaution": "Pre-symptomatic physiological stress may be developing. Conduct a secondary leaf check across multiple field zones within 48 hours.",
                "what_to_check": "Confirm field conditions, scout across 4 distinct field quadrats, and repeat multimodal analysis within 48 hours.",
                "rationale": "Environmental stress often causes internal biochemical disruption before visible foliar symptoms (chlorosis or wilting) emerge.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 5: High-Confidence Aligned Water Stress
        # -------------------------------------------------------------
        if water_val >= t["cnn_water_stress_min_pct"] and snn_severity == "High":
            triggered_rules.append({
                "rule_id": "EVR-005",
                "name": "Strong Aligned Water Stress Validation",
                "severity": RuleSeverity.WARNING.value,
                "rule_status": "High Environmental Risk",
                "condition": f"CNN Water Stress ({water_val:.1f}%) >= {t['cnn_water_stress_min_pct']}% AND SNN Environmental Stress is HIGH",
                "reason": "Foliar symptoms of water stress are strongly reinforced by high environmental risk.",
                "interpretation": "Strong multi-modal alignment: foliar symptoms of water stress are reinforced by high environmental risk.",
                "impact": "Concordant visual and environmental evidence significantly elevates the probability of genuine moisture stress requiring active intervention.",
                "precaution": "Prioritize immediate irrigation management review and soil moisture verification at the root zone (15-30 cm depth).",
                "what_to_check": "Verify drip line pressure, probe soil moisture tension at 15cm and 30cm depths, and inspect canopy wilting recovery by dusk.",
                "rationale": "Concordant visual and environmental evidence significantly elevates the probability of genuine moisture stress requiring intervention.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 6: Nutrient Deficiency Symptom Validation
        # -------------------------------------------------------------
        if nutrient_val >= t["cnn_nutrient_min_pct"]:
            triggered_rules.append({
                "rule_id": "EVR-006",
                "name": "Nutrient Deficiency Foliar Detection",
                "severity": RuleSeverity.CAUTION.value,
                "rule_status": "Precaution Detected",
                "condition": f"CNN Nutrient Deficiency ({nutrient_val:.1f}%) >= {t['cnn_nutrient_min_pct']}%",
                "reason": "Foliar patterns (interveinal chlorosis or purpling) indicate potential nitrogen, phosphorus, or micronutrient deficit.",
                "interpretation": "Foliar patterns (interveinal chlorosis or purpling) indicate potential nitrogen, phosphorus, or micronutrient deficit.",
                "impact": "Visual chlorosis patterns indicate chlorophyll degradation associated with nutrient redistribution in the plant.",
                "precaution": "Conduct a confirmatory soil/petiole N-P-K nutrient analysis; consider balanced foliar spray application if deficiency symptoms spread.",
                "what_to_check": "Collect petiole samples for rapid N-P-K test, inspect lower versus upper leaves to differentiate mobile vs immobile nutrient deficiency, and check soil pH.",
                "rationale": "Visual chlorosis patterns indicate chlorophyll degradation associated with nutrient redistribution in the plant.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        # -------------------------------------------------------------
        # RULE 7: Baseline Crop Stability (No Critical Alerts)
        # -------------------------------------------------------------
        if not triggered_rules and healthy_val >= 50.0 and snn_severity == "Low":
            triggered_rules.append({
                "rule_id": "EVR-007",
                "name": "Routine Crop Health Maintenance",
                "severity": RuleSeverity.INFO.value,
                "rule_status": "No Rule Triggered",
                "condition": f"CNN Healthy ({healthy_val:.1f}%) >= 50% AND SNN Environmental Stress is LOW",
                "reason": "All environmental and foliar signals are within standard agricultural baseline limits.",
                "interpretation": "Crop health appears stable with no adverse environmental or visual stress anomalies detected.",
                "impact": "Both visual canopy indicators and ambient environmental factors are within baseline physiological ranges with low abiotic stress risk.",
                "precaution": "Maintain regular scheduled irrigation and nutrient scouting routines.",
                "what_to_check": "Continue routine weekly canopy scouting and maintain regular soil moisture sensor log reviews.",
                "rationale": "Both visual canopy indicators and ambient environmental factors are within baseline physiological ranges.",
                "threshold_status": "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION",
            })

        return triggered_rules
