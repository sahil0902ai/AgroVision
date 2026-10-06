from pydantic import BaseModel, Field


class SNNPredictRequest(BaseModel):
    """
    Explicit environmental/context payload required by the trained 33-feature
    SNN. Every field is a real model input — none may be omitted or defaulted.
    Units are the native units of the SNN training dataset.
    """

    # Environmental measurements (accepted ranges are wider than the trained
    # support so values can be set beyond training conditions; such values are
    # MinMax-extrapolated by the model)
    temperature: float = Field(..., allow_inf_nan=False, description="Air temperature in °C (accepted 0–55; trained on 11.1–40.7)")
    humidity: float = Field(..., allow_inf_nan=False, description="Relative humidity in % (accepted 0–100; trained on 17.2–95.5)")
    rainfall: float = Field(..., allow_inf_nan=False, description="Rainfall in mm (accepted 0–250; trained on 0–118.1)")
    soil_moisture: float = Field(..., allow_inf_nan=False, description="Volumetric soil moisture in m³/m³ (accepted 0–0.80; trained on 0.042–0.578)")
    aqi: float = Field(..., allow_inf_nan=False, description="Air Quality Index (accepted 0–500; trained on 25–112.6)")
    ozone: float = Field(..., allow_inf_nan=False, description="Ozone concentration (accepted 0–0.20; trained on 0.028–0.054, training-native units)")

    # Field location & crop context
    latitude: float = Field(..., allow_inf_nan=False, description="Field latitude (training range 20.4–21.55)")
    longitude: float = Field(..., allow_inf_nan=False, description="Field longitude (training range 77.78–79.65)")
    growth_stage: str = Field(..., description="Crop growth stage: Boll_Development, Flowering, Maturity, Sowing, or Vegetative")
    days_since_sowing: float = Field(..., allow_inf_nan=False, description="Days since sowing (training range 0–213)")

    # Soil nutrients (training-native units)
    soil_nitrogen: float = Field(..., allow_inf_nan=False, description="Soil nitrogen — constant at 280 in the training dataset")
    soil_phosphorus: float = Field(..., allow_inf_nan=False, description="Soil phosphorus (training range 4–22.93)")
    soil_potassium: float = Field(..., allow_inf_nan=False, description="Soil potassium (training range 60–184.81)")

    # Canopy & spectral inputs (training-native units)
    ndvi: float = Field(..., allow_inf_nan=False, description="NDVI (training range 0.15–0.85)")
    evi: float = Field(..., allow_inf_nan=False, description="EVI (training range 0.08–0.639)")
    gndvi: float = Field(..., allow_inf_nan=False, description="GNDVI (training range 0.1–0.74)")
    sif_740: float = Field(..., allow_inf_nan=False, description="Solar-induced fluorescence at 740nm (training range 0.2–2.5)")
    f687: float = Field(..., allow_inf_nan=False, description="Fluorescence at 687nm (training range 0.45–2.08)")
    f760: float = Field(..., allow_inf_nan=False, description="Fluorescence at 760nm (training range 0.58–2.62)")
    fluorescence_ratio: float = Field(..., allow_inf_nan=False, description="Fluorescence ratio (training range 0.647–1.0)")
    chlorophyll_content: float = Field(..., allow_inf_nan=False, description="Chlorophyll content (training range 15–69.3)")
    leaf_area_index: float = Field(..., allow_inf_nan=False, description="Leaf area index (training range 0.3–4.73)")
    light: float = Field(..., allow_inf_nan=False, description="Light intensity (training range 200–906.5)")

    observation_date: str | None = Field(
        default=None,
        description="Observation date as ISO YYYY-MM-DD. Calendar features (year/month/time_index/date_*) are derived from it exactly as in training. Defaults to today.",
    )


class SNNPredictionDetails(BaseModel):
    stress_level: str = Field(..., alias="class", description="Predicted environmental stress level: High, Low, or Moderate")
    class_index: int = Field(..., description="Predicted class index (0=High, 1=Low, 2=Moderate)")
    confidence: float = Field(
        ...,
        description="Softmax score of the predicted class over summed output spikes — the quantity the training cross-entropy objective operated on.",
    )

    class Config:
        populate_by_name = True


class SNNPredictResponse(BaseModel):
    success: bool = Field(default=True)
    model: str = Field(default="AgroVision SNN")
    prediction: SNNPredictionDetails
    class_scores: dict[str, float] = Field(..., description="Softmax over summed output spike counts per class (High/Low/Moderate)")
    spike_counts: dict[str, int] = Field(..., description="Raw accumulated output spikes per class over T time steps")
    timesteps: int = Field(..., description="Number of SNN time steps (T=10, as in training)")
    environmental_inputs: dict[str, float | str] = Field(..., description="Echo of the environmental values used for this prediction")
    inference_time_ms: float | None = Field(None)


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' when all models are loaded, 'degraded' otherwise")
    cnn_loaded: bool = Field(..., description="Whether CNN model weights are loaded and ready")
    snn_loaded: bool = Field(..., description="Whether SNN model weights are loaded and ready")
    device: str | None = Field(None, description="Inference device (cpu or cuda)")
    weather_api_configured: bool = Field(default=False, description="Whether OpenWeather API key is configured")
    gemini_api_configured: bool = Field(default=False, description="Whether Google Gemini API key is configured")
    gemini_model: str = Field(default="gemini-2.5-flash", description="Configured Gemini model")
