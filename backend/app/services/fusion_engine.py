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
    alignment_score: float  # Qualitative alignment measure 0.0 to 1.0
    summary: str
    interpretation: str
    visual_lead_evidence: str
    environmental_lead_evidence: str
    details: dict[str, Any]


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
        - snn_result: {"severity": str, "confidence": float, "spike_counts": dict[str, int] or list[int]}
        - env_inputs: optional user-entered / field parameters for context
        """
        visual_class = cnn_result.get("class", "Unknown")
        visual_conf = float(cnn_result.get("confidence", 0.0))
        visual_probs = cnn_result.get("probabilities", {})

        # Normalize key casing if necessary
        clean_probs = {}
        for k, v in visual_probs.items():
            clean_key = k.lower().replace(" ", "_")
            clean_probs[clean_key] = float(v)

        snn_severity = snn_result.get("severity", snn_result.get("predicted_class", "Moderate"))
        snn_conf = float(snn_result.get("confidence", 0.0))

        # -------------------------------------------------------------
        # 1. Evaluate Concordance & Relationship Category
        # -------------------------------------------------------------
        if visual_class == "Healthy" and snn_severity == "Low":
            relationship = EvidenceRelationship.BASELINE_HEALTHY
            alignment_score = 0.95
            summary = "Visual and environmental evidence both indicate stable, healthy crop conditions."
            interpretation = "The canopy shows no visual stress symptoms, and ambient agro-climatic conditions present low environmental risk."

        elif visual_class in ["Water Stress", "Heat Stress"] and snn_severity == "High":
            relationship = EvidenceRelationship.ALIGNED
            alignment_score = 0.90
            summary = f"Strong multi-modal alignment: Visual {visual_class} is reinforced by High environmental stress."
            interpretation = (
                f"Foliar indications of {visual_class} are concordant with adverse weather and soil conditions. "
                "The combined evidence strongly supports active environmental/physiological stress."
            )

        elif visual_class in ["Nutrient Deficiency", "Pollution"] and snn_severity in ["High", "Moderate"]:
            relationship = EvidenceRelationship.ALIGNED
            alignment_score = 0.85
            summary = f"Multi-modal alignment: Visual {visual_class} matches elevated environmental risk factors."
            interpretation = (
                f"Visual symptoms of {visual_class} occur alongside elevated environmental risk indicators. "
                "Stress factors are likely compounding plant vulnerability."
            )

        elif visual_class == "Healthy" and snn_severity == "High":
            relationship = EvidenceRelationship.CONFLICTING
            alignment_score = 0.35
            summary = "Evidentiary Disagreement: Leaf canopy appears Healthy, but Environmental Stress is HIGH."
            interpretation = (
                "Visual analysis detects no outward foliar lesions or discoloration, yet ambient environmental metrics "
                "indicate acute stress pressure. This pattern is characteristic of pre-symptomatic stress or localized field variation."
            )

        elif visual_class in ["Water Stress", "Heat Stress", "Nutrient Deficiency", "Pollution"] and snn_severity == "Low":
            relationship = EvidenceRelationship.PARTIALLY_ALIGNED
            alignment_score = 0.60
            summary = f"Partial alignment: Visual {visual_class} detected under Low macro-environmental stress."
            interpretation = (
                f"Foliar symptoms indicate {visual_class}, but general environmental metrics remain benign. "
                "This suggests localized soil deficits, pest damage mimicking stress, or legacy symptoms from prior weather events."
            )

        elif snn_severity == "Moderate":
            relationship = EvidenceRelationship.PARTIALLY_ALIGNED
            alignment_score = 0.75
            summary = f"Moderate environmental risk with visual indication of {visual_class}."
            interpretation = (
                f"Environmental risk is moderate while the canopy exhibits {visual_class}. "
                "Ongoing monitoring is recommended as conditions may transition."
            )

        else:
            relationship = EvidenceRelationship.INCONCLUSIVE
            alignment_score = 0.50
            summary = f"Combined evidence: Visual {visual_class} / Environmental {snn_severity}."
            interpretation = "Visual and environmental signals show intermediate characteristics requiring standard field follow-up."

        visual_lead = f"{visual_class} ({visual_conf * 100:.1f}% confidence)"
        env_lead = f"{snn_severity} Severity ({snn_conf * 100:.1f}% activity score)"

        return FusedEvidence(
            relationship=relationship,
            alignment_score=alignment_score,
            summary=summary,
            interpretation=interpretation,
            visual_lead_evidence=visual_lead,
            environmental_lead_evidence=env_lead,
            details={
                "visual_class": visual_class,
                "visual_confidence": visual_conf,
                "environmental_severity": snn_severity,
                "environmental_confidence": snn_conf,
                "concordance": relationship.value,
            }
        )
