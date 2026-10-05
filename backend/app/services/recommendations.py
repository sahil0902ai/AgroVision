"""
AgroVision Expert Recommendation & Veto Synthesis Service.

Synthesizes CNN visual predictions, SNN environmental risk assessments,
and physical field parameters into traceable, actionable decision support.
"""

from typing import Any
from .expert_veto_rules import ExpertVetoRuleRegistry, RuleSeverity


class ExpertRecommendationEngine:
    """
    Expert rule engine synthesizing CNN visual leaf condition, SNN environmental
    stress severity, and field parameters into domain agronomic advice and veto qualifications.
    """

    _registry = ExpertVetoRuleRegistry()

    @classmethod
    def evaluate(
        cls,
        cnn_probs: dict[str, float],
        snn_severity: str,
        env_data: dict[str, Any],
        fusion_relationship: str = "INCONCLUSIVE"
    ) -> list[str]:
        """
        Backward-compatible evaluation method returning a list of actionable recommendation strings.
        """
        structured = cls.evaluate_structured(cnn_probs, snn_severity, env_data, fusion_relationship)
        recommendations: list[str] = []

        for rule in structured["triggered_rules"]:
            rec_text = f"[{rule['severity']}] {rule['name']}: {rule['interpretation']} Precaution: {rule['precaution']}"
            recommendations.append(rec_text)

        if not recommendations:
            recommendations.append(structured["final_assessment"]["summary"])

        return recommendations

    @classmethod
    def evaluate_structured(
        cls,
        cnn_probs: dict[str, float],
        snn_severity: str,
        env_data: dict[str, Any],
        fusion_relationship: str = "INCONCLUSIVE"
    ) -> dict[str, Any]:
        """
        Full structured evaluation returning all triggered rules, severity flags,
        and final qualified assessment.
        """
        triggered = cls._registry.evaluate_rules(
            cnn_probs=cnn_probs,
            snn_severity=snn_severity,
            env_data=env_data,
            fusion_relationship=fusion_relationship
        )

        has_critical = any(r["severity"] == RuleSeverity.CRITICAL.value for r in triggered)
        has_warning = any(r["severity"] == RuleSeverity.WARNING.value for r in triggered)
        has_caution = any(r["severity"] == RuleSeverity.CAUTION.value for r in triggered)

        if has_critical:
            overall_status = "CRITICAL_ACTION_REQUIRED"
        elif has_warning:
            overall_status = "WARNING_ATTENTION_REQUIRED"
        elif has_caution:
            overall_status = "CAUTIONARY_MONITORING"
        else:
            overall_status = "ROUTINE_MONITORING"

        # Generate synthesized final assessment summary
        if triggered:
            top_rule = triggered[0]
            summary = f"{top_rule['name']}: {top_rule['interpretation']}"
            precautions = [r["precaution"] for r in triggered]
        else:
            summary = "Crop health indicators are within baseline parameters. No critical agro-climatic stress detected."
            precautions = ["Maintain scheduled irrigation and routine crop scouting."]

        return {
            "overall_status": overall_status,
            "rule_count": len(triggered),
            "triggered_rules": triggered,
            "final_assessment": {
                "summary": summary,
                "overall_status": overall_status,
                "precautions": precautions,
                "requires_immediate_action": has_critical or has_warning,
            }
        }
