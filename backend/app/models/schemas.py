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
    user_email: str | None = None
    field_name: str | None = "Field A — North Parcel"
    image_url: str
    heatmap_url: str | None = None
    temperature: float
    humidity: float
    soil_moisture: float
    rainfall_mm: float = 0.0
    forecast_rainfall_mm: float = 0.0
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
    weather_source: str | None = "OpenWeather"
    weather_context_json: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class FieldCreateSchema(BaseModel):
    field_name: str
    zone_label: str | None = "Central Cotton Zone"
    latitude: float = 20.9750
    longitude: float = 78.7200
    crop_stage: str = "Flowering"
    days_since_sowing: int = 60
    soil_type: str = "Black Cotton Soil (Vertisol)"
    acreage: float = 5.0


class FieldUpdateSchema(BaseModel):
    field_name: str | None = None
    zone_label: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    crop_stage: str | None = None
    days_since_sowing: int | None = None
    soil_type: str | None = None
    acreage: float | None = None
    is_active: int | None = None


class FieldResponseSchema(BaseModel):
    id: int
    field_id: str
    user_email: str
    field_name: str
    zone_label: str | None = None
    latitude: float
    longitude: float
    crop_stage: str
    days_since_sowing: int
    soil_type: str
    acreage: float
    is_active: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationCreateSchema(BaseModel):
    title: str
    message: str
    notif_type: str = "system"
    link_url: str | None = None


class NotificationResponseSchema(BaseModel):
    id: int
    user_email: str
    title: str
    message: str
    notif_type: str
    link_url: str | None = None
    is_read: int
    created_at: datetime

    class Config:
        from_attributes = True

