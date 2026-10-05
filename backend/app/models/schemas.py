from datetime import datetime
from pydantic import BaseModel


class SNNResultSchema(BaseModel):
    severity: str
    confidence_percent: float
    spike_counts: list[int]
    timesteps: int = 10


class PredictResponseSchema(BaseModel):
    record_uuid: str
    image_url: str
    heatmap_url: str | None
    cnn_predictions: dict[str, float]
    snn_result: SNNResultSchema
    recommendations: list[str]


class AnalysisRecordResponseSchema(BaseModel):
    id: int
    record_uuid: str
    image_url: str
    heatmap_url: str | None = None
    temperature: float
    humidity: float
    soil_moisture: float
    rainfall_mm: float = 0.0
    aqi: float = 50.0
    ozone: float = 0.040
    growth_stage: str = "Flowering"
    stress_severity: str
    confidence_score: float
    cnn_predictions_json: str | None = None
    spike_counts_json: str | None = None
    fusion_json: str | None = None
    expert_veto_json: str | None = None
    recommendations_json: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
