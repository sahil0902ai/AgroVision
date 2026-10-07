"""
Pydantic Schemas for Multimodal Fusion and Combined AgroVision Analysis.
"""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class VisualEvidenceInput(BaseModel):
    predicted_class: str = Field(..., alias="class", description="CNN visual class: Healthy, Water Stress, Heat Stress, Nutrient Deficiency, or Pollution")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Softmax confidence score from CNN")
    probabilities: dict[str, float] = Field(default_factory=dict, description="Full 5-class visual probability distribution")

    class Config:
        populate_by_name = True


class EnvironmentalEvidenceInput(BaseModel):
    severity: str = Field(..., alias="class", description="SNN environmental stress severity: High, Low, or Moderate")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Spike activity confidence score from SNN")
    spike_counts: dict[str, int] | list[int] = Field(default_factory=dict, description="Raw accumulated spike counts across timesteps")
    timesteps: int = Field(default=10, description="Number of simulation timesteps (T=10)")

    class Config:
        populate_by_name = True


class CombineAnalysisRequest(BaseModel):
    visual_evidence: VisualEvidenceInput
    environmental_evidence: EnvironmentalEvidenceInput
    environmental_inputs: dict[str, Any] = Field(
        ...,
        description="Raw environmental inputs used for inference: temperature, humidity, rainfall, soil_moisture, aqi, ozone, growth_stage, etc."
    )
    field_name: Optional[str] = Field("Field A — North Parcel", description="Field/Plot identifier")
    user_email: Optional[str] = Field(None, description="Authenticated user email for scoped history")
    weather_context: Optional[dict[str, Any]] = Field(None, description="OpenWeather canonical snapshot used during analysis")


class FusionDetails(BaseModel):
    relationship: str = Field(..., description="ALIGNED, PARTIALLY_ALIGNED, CONFLICTING, BASELINE_HEALTHY, or INCONCLUSIVE")
    alignment_score: float = Field(..., ge=0.0, le=1.0, description="Qualitative alignment metric")
    summary: str
    interpretation: str
    visual_lead_evidence: str
    environmental_lead_evidence: str


class TriggeredRule(BaseModel):
    rule_id: str
    name: str
    severity: str
    rule_status: str | None = None
    condition: str
    reason: str | None = None
    interpretation: str
    impact: str | None = None
    precaution: str
    what_to_check: str | None = None
    rationale: str
    threshold_status: str = "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION"


class ExpertVetoDetails(BaseModel):
    overall_status: str
    rule_count: int
    triggered_rules: list[TriggeredRule] = Field(default_factory=list)


class FinalAssessmentDetails(BaseModel):
    summary: str
    overall_status: str
    precautions: list[str] = Field(default_factory=list)
    requires_immediate_action: bool = False


class ProvenanceMetadata(BaseModel):
    cnn_model: str = "AgroVision Custom CNN (110k parameters, 5 classes)"
    snn_model: str = "AgroVision 3-layer LIF SNN (33 features, T=10)"
    gemini_model: str = "Google Gemini 2.5 Flash"
    weather_provider: str = "OpenWeather API (Live & Forecast)"
    fusion_type: str = "Deterministic Multi-modal Evidentiary Alignment"
    expert_rules_engine: str = "AgroVision Deterministic Rule Registry"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    disclaimer: str = (
        "Individual model test accuracies: CNN=86.05%, SNN=91.81%. "
        "Outputs provide agricultural decision-support; thresholds are illustrative and require local agronomic validation."
    )


class CombinedAnalysisResponse(BaseModel):
    success: bool = True
    record_uuid: str | None = None
    field_name: str | None = "Field A — North Parcel"
    visual_assessment: dict[str, Any]
    environmental_assessment: dict[str, Any]
    environmental_inputs: dict[str, Any]
    weather_context: dict[str, Any] | None = None
    fusion: FusionDetails
    expert_veto: ExpertVetoDetails
    final_assessment: FinalAssessmentDetails
    provenance: ProvenanceMetadata = Field(default_factory=ProvenanceMetadata)


# =========================================================
# UNIFIED REAL ML PIPELINE SCHEMAS (/api/analysis)
# =========================================================

class CNNAnalysisOutput(BaseModel):
    predicted_class: str
    confidence: float
    confidence_percentage: float
    probabilities: dict[str, float]
    image_url: str
    heatmap_url: str | None = None
    inference_time_ms: float = 0.0
    architecture: str = "ResNet-18 Custom"
    input_resolution: str = "224x224 RGB"
    provenance: str = "CNN MODEL"


class SNNAnalysisOutput(BaseModel):
    predicted_severity: str
    confidence: float
    confidence_percentage: float
    spike_counts: dict[str, int]
    timesteps: int = 10
    membrane_decay_beta: float = 0.95
    feature_count: int = 33
    inference_time_ms: float = 0.0
    provenance: str = "SNN MODEL"


class EnvironmentAnalysisOutput(BaseModel):
    temperature: float
    humidity: float
    rainfall: float
    soil_moisture: float
    aqi: float
    ozone: float
    growth_stage: str
    days_since_sowing: int = 60
    weather_source: str = "AUTO · Weather API"
    weather_context: dict[str, Any] | None = None
    provenance: str = "AUTO · Weather API / MANUAL INPUT"


class FusionAnalysisOutput(BaseModel):
    relationship: str
    alignment_score: float
    summary: str
    interpretation: str
    visual_lead_evidence: str
    environmental_lead_evidence: str
    provenance: str = "FUSION ENGINE"


class ExpertVetoAnalysisOutput(BaseModel):
    overall_status: str
    rule_count: int
    triggered_rules: list[TriggeredRule] = Field(default_factory=list)
    provenance: str = "RULE ENGINE"


class FinalAssessmentOutput(BaseModel):
    diagnosis: str
    environmental_risk: str
    relationship: str
    summary: str
    requires_immediate_action: bool = False
    recommendations: list[str] = Field(default_factory=list)
    what_to_check_next: list[str] = Field(default_factory=list)
    provenance: str = "FINAL SYNTHESIS"


class MetadataOutput(BaseModel):
    record_uuid: str
    user_email: str | None = None
    field_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data_provenance: dict[str, str] = Field(default_factory=dict)
    latencies: dict[str, float] = Field(default_factory=dict)


class UnifiedAnalysisResponse(BaseModel):
    success: bool = True
    record_uuid: str
    cnn: CNNAnalysisOutput
    snn: SNNAnalysisOutput
    environment: EnvironmentAnalysisOutput
    fusion: FusionAnalysisOutput
    expert_veto: ExpertVetoAnalysisOutput
    final_assessment: FinalAssessmentOutput
    metadata: MetadataOutput

