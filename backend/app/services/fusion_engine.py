"""
AgroVision Multimodal Fusion Engine.

Synthesizes independent visual evidence (CNN 5-class distribution) and
environmental evidence (SNN 3-class spiking inference) into a structured,
transparent, and traceable joint assessment.

IMPORTANT:
This module does NOT invent an unverified meta-classifier or claim a fabricated
"combined accuracy". It evaluates the explicit logical and evidentiary
relationship (ALIGNED, PARTIALLY_ALIGNED, CONFLICTING, BASELINE_HEALTHY)
between independent physical observables.
"""

from dataclasses import dataclass
from enum import Enum
import math
from typing import Any


class EvidenceRelationship(str, Enum):
    ALIGNED = "ALIGNED"
    PARTIALLY_ALIGNED = "PARTIALLY_ALIGNED"
    CONFLICTING = "CONFLICTING"
    BASELINE_HEALTHY = "BASELINE_HEALTHY"
    INCONCLUSIVE = "INCONCLUSIVE"


@dataclass
class FusedEvidence:
    relationship: EvidenceRelationship
    alignment_score: float | None  # Probabilistic concordance in [0.0, 1.0], or None if unavailable
    summary: str
    interpretation: str
    visual_lead_evidence: str
    environmental_lead_evidence: str
    details: dict[str, Any]


def _extract_cnn_binary_probs(visual_probs: dict[str, Any] | None) -> tuple[float, float] | None:
    """
    Projects the CNN 5-class softmax probability distribution onto the binary
    common stress space Omega = {Non-Stress, Stress}:
      - Non-Stress: {Healthy}
      - Stress:     {Water Stress, Heat Stress, Nutrient Deficiency, Pollution}

    Accepts normalized [0, 1] or percentage [0, 100] distributions and normalizes
    by the total probability mass. Returns None if valid probabilities are absent.
    """
    if not isinstance(visual_probs, dict) or not visual_probs:
        return None

    clean_probs: dict[str, float] = {}
    for k, v in visual_probs.items():
        try:
            val = float(v)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(val) or val < 0.0:
            return None
        clean_probs[str(k).strip().lower().replace(" ", "_")] = val

    total = sum(clean_probs.values())
    if total <= 0.0:
        return None

    p_no_stress = clean_probs.get("healthy", 0.0) / total
    p_no_stress = min(1.0, max(0.0, p_no_stress))
    p_stress = 1.0 - p_no_stress
    return p_no_stress, p_stress


def _extract_snn_binary_probs(snn_result: dict[str, Any]) -> tuple[float, float] | None:
    """
    Projects the SNN 3-class ordinal stress distribution {Low, Moderate, High}
    onto Omega = {Non-Stress, Stress} using normalized ordinal rank r(k) = k / (K - 1)
    for K = 3 (Low -> 0, Moderate -> 0.5, High -> 1):
      q_stress    = q_High + 0.5 * q_Moderate
      q_no_stress = 1 - q_stress = q_Low + 0.5 * q_Moderate

    Uses SNN `class_scores` when provided, or reconstructs the exact model-consistent
    softmax distribution over `spike_counts` (matching SNNInferenceEngine.predict).
    Returns None if neither valid class_scores nor positive spike_counts are available.
    """
    if not isinstance(snn_result, dict):
        return None

    q_low = q_mod = q_high = None

    class_scores = snn_result.get("class_scores")
    if isinstance(class_scores, dict) and class_scores:
        parsed: dict[str, float] = {}
        for k, v in class_scores.items():
            try:
                val = float(v)
            except (TypeError, ValueError):
                continue
            if not math.isfinite(val) or val < 0.0:
                parsed = {}
                break
            parsed[str(k).strip().lower()] = val
        total = sum(parsed.values())
        if total > 0.0 and any(key in parsed for key in ("low", "moderate", "medium", "high")):
            q_low = parsed.get("low", 0.0) / total
            q_mod = parsed.get("moderate", parsed.get("medium", 0.0)) / total
            q_high = parsed.get("high", 0.0) / total

    if q_low is None:
        spikes = snn_result.get("spike_counts")
        raw_high = raw_low = raw_mod = None
        if isinstance(spikes, dict) and spikes:
            norm = {str(k).strip().lower(): v for k, v in spikes.items()}
            if any(k in norm for k in ("high", "low", "moderate", "medium")):
                try:
                    raw_high = float(norm.get("high", 0.0))
                    raw_low = float(norm.get("low", 0.0))
                    raw_mod = float(norm.get("moderate", norm.get("medium", 0.0)))
                except (TypeError, ValueError):
                    raw_high = raw_low = raw_mod = None
        elif isinstance(spikes, (list, tuple)) and len(spikes) == 3:
            # Ordered [High, Low, Moderate] as produced by AIPipelineService
            try:
                raw_high, raw_low, raw_mod = float(spikes[0]), float(spikes[1]), float(spikes[2])
            except (TypeError, ValueError):
                raw_high = raw_low = raw_mod = None

        if raw_high is not None and raw_low is not None and raw_mod is not None:
            if (
                all(math.isfinite(x) and x >= 0.0 for x in (raw_high, raw_low, raw_mod))
                and (raw_high + raw_low + raw_mod) > 0.0
            ):
                m = max(raw_high, raw_low, raw_mod)
                e_high = math.exp(raw_high - m)
                e_low = math.exp(raw_low - m)
                e_mod = math.exp(raw_mod - m)
                denom = e_high + e_low + e_mod
                q_high = e_high / denom
                q_low = e_low / denom
                q_mod = e_mod / denom

    if q_low is None or q_mod is None or q_high is None:
        return None

    q_stress = min(1.0, max(0.0, q_high + 0.5 * q_mod))
    q_no_stress = 1.0 - q_stress
    return q_no_stress, q_stress


def compute_multimodal_concordance(
    cnn_result: dict[str, Any],
    snn_result: dict[str, Any],
) -> tuple[float | None, dict[str, float] | None]:
    """
    Computes exact probabilistic concordance P(Z_CNN = Z_SNN) over the shared
    binary stress event space Omega = {Non-Stress, Stress}:
        Concordance = p_no_stress * q_no_stress + p_stress * q_stress
    Returns (concordance_score, projection_details) or (None, None) if unavailable.
    """
    cnn_bin = _extract_cnn_binary_probs(cnn_result.get("probabilities") if isinstance(cnn_result, dict) else None)
    snn_bin = _extract_snn_binary_probs(snn_result)
    if cnn_bin is None or snn_bin is None:
        return None, None

    p_no_stress, p_stress = cnn_bin
    q_no_stress, q_stress = snn_bin
    score = round(min(1.0, max(0.0, p_no_stress * q_no_stress + p_stress * q_stress)), 4)
    return score, {
        "cnn_no_stress_prob": round(p_no_stress, 4),
        "cnn_stress_prob": round(p_stress, 4),
        "snn_no_stress_prob": round(q_no_stress, 4),
        "snn_stress_prob": round(q_stress, 4),
    }


class MultimodalFusionEngine:
    """
    Evaluates concordance between leaf visual symptoms and macro/micro-environmental risk.
    """

    @staticmethod
    def fuse(
        cnn_result: dict[str, Any],
        snn_result: dict[str, Any],
        env_inputs: dict[str, Any] | None = None
    ) -> FusedEvidence:
        """
        Combines CNN visual prediction and SNN environmental stress prediction.

        Parameters:
        - cnn_result: {"class": str, "confidence": float, "probabilities": dict[str, float]}
        - snn_result: {"severity": str, "confidence": float, "class_scores": dict[str, float], "spike_counts": dict[str, int] or list[int]}
        - env_inputs: optional user-entered / field parameters for context
        """
        visual_class = cnn_result.get("class", "Unknown")
        visual_conf = float(cnn_result.get("confidence", 0.0))

        snn_severity = snn_result.get("severity", snn_result.get("predicted_class", "Moderate"))
        snn_conf = float(snn_result.get("confidence", 0.0))

        alignment_score, projection_details = compute_multimodal_concordance(cnn_result, snn_result)

        # -------------------------------------------------------------
        # 1. Evaluate Concordance Category & Relationship
        # -------------------------------------------------------------
        if visual_class == "Healthy" and snn_severity == "Low":
            relationship = EvidenceRelationship.BASELINE_HEALTHY
            summary = "Visual and environmental evidence both indicate stable, healthy crop conditions."
            interpretation = "The canopy shows no visual stress symptoms, and ambient agro-climatic conditions present low environmental risk."

        elif visual_class in ["Water Stress", "Heat Stress"] and snn_severity == "High":
            relationship = EvidenceRelationship.ALIGNED
            summary = f"Strong multi-modal alignment: Visual {visual_class} is reinforced by High environmental stress."
            interpretation = (
                f"Foliar indications of {visual_class} are concordant with adverse weather and soil conditions. "
                "The combined evidence strongly supports active environmental/physiological stress."
            )

        elif visual_class in ["Nutrient Deficiency", "Pollution"] and snn_severity in ["High", "Moderate"]:
            relationship = EvidenceRelationship.ALIGNED
            summary = f"Multi-modal alignment: Visual {visual_class} matches elevated environmental risk factors."
            interpretation = (
                f"Visual symptoms of {visual_class} occur alongside elevated environmental risk indicators. "
                "Stress factors are likely compounding plant vulnerability."
            )

        elif visual_class == "Healthy" and snn_severity == "High":
            relationship = EvidenceRelationship.CONFLICTING
            summary = "Evidentiary Disagreement: Leaf canopy appears Healthy, but Environmental Stress is HIGH."
            interpretation = (
                "Visual analysis detects no outward foliar lesions or discoloration, yet ambient environmental metrics "
                "indicate acute stress pressure. This pattern is characteristic of pre-symptomatic stress or localized field variation."
            )

        elif visual_class in ["Water Stress", "Heat Stress", "Nutrient Deficiency", "Pollution"] and snn_severity == "Low":
            relationship = EvidenceRelationship.PARTIALLY_ALIGNED
            summary = f"Partial alignment: Visual {visual_class} detected under Low macro-environmental stress."
            interpretation = (
                f"Foliar symptoms indicate {visual_class}, but general environmental metrics remain benign. "
                "This suggests localized soil deficits, pest damage mimicking stress, or legacy symptoms from prior weather events."
            )

        elif snn_severity == "Moderate":
            relationship = EvidenceRelationship.PARTIALLY_ALIGNED
            summary = f"Moderate environmental risk with visual indication of {visual_class}."
            interpretation = (
                f"Environmental risk is moderate while the canopy exhibits {visual_class}. "
                "Ongoing monitoring is recommended as conditions may transition."
            )

        else:
            relationship = EvidenceRelationship.INCONCLUSIVE
            summary = f"Combined evidence: Visual {visual_class} / Environmental {snn_severity}."
            interpretation = "Visual and environmental signals show intermediate characteristics requiring standard field follow-up."

        visual_lead = f"{visual_class} ({visual_conf * 100:.1f}% confidence)"
        env_lead = f"{snn_severity} Severity ({snn_conf * 100:.1f}% activity score)"

        details: dict[str, Any] = {
            "visual_class": visual_class,
            "visual_confidence": visual_conf,
            "environmental_severity": snn_severity,
            "environmental_confidence": snn_conf,
            "concordance": relationship.value,
            "alignment_score": alignment_score,
        }
        if projection_details is not None:
            details["common_space_projection"] = projection_details

        return FusedEvidence(
            relationship=relationship,
            alignment_score=alignment_score,
            summary=summary,
            interpretation=interpretation,
            visual_lead_evidence=visual_lead,
            environmental_lead_evidence=env_lead,
            details=details,
        )
