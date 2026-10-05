
from pydantic import BaseModel, Field


class PredictionDetails(BaseModel):
    predicted_class: str = Field(..., alias="class", description="Predicted stress class name")
    confidence: float = Field(..., description="Inference confidence score between 0.0 and 1.0")

    class Config:
        populate_by_name = True

class PreprocessingMetadata(BaseModel):
    image_size: int = Field(default=224, description="Input image resolution in pixels")
    channels: int = Field(default=3, description="Color channels (RGB)")
    normalization: str = Field(default="ImageNet", description="Normalization standard applied")

class CNNPredictResponse(BaseModel):
    success: bool = Field(default=True, description="Indicates whether inference succeeded")
    model: str = Field(default="AgroVision CNN", description="Model identifier")
    prediction: PredictionDetails = Field(..., description="Top predicted class and confidence")
    probabilities: dict[str, float] = Field(..., description="5-class probability distribution")
    preprocessing: PreprocessingMetadata = Field(default_factory=PreprocessingMetadata, description="Deterministic preprocessing info")
    low_confidence_warning: bool | None = Field(default=False, description="Flag if inference confidence is below advisory threshold")
    advisory_message: str | None = Field(default=None, description="Screening advisory note if confidence is low")
    inference_time_ms: float | None = Field(None, description="Inference execution duration in milliseconds")
