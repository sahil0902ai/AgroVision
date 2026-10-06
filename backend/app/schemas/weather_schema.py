from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class LocationInfo(BaseModel):
    latitude: float
    longitude: float
    name: Optional[str] = "Unknown Location"
    country: Optional[str] = "IN"


class CurrentWeather(BaseModel):
    temperature_c: float = Field(..., description="Current air temperature in degrees Celsius")
    humidity_percent: float = Field(..., description="Relative humidity in percentage (0-100)")
    rainfall_mm: float = Field(0.0, description="Observed rainfall over past 1-3 hours in mm")
    wind_speed: float = Field(0.0, description="Wind speed in meters per second")
    cloud_cover: int = Field(0, description="Cloud cover percentage (0-100)")
    weather_condition: str = Field("Clear", description="Main weather condition category (e.g. Clear, Clouds, Rain)")
    weather_description: str = Field("clear sky", description="Detailed weather description")
    pressure_hpa: Optional[float] = Field(1013.0, description="Atmospheric pressure in hPa")


class ForecastItem(BaseModel):
    timestamp_iso: str
    temperature_c: float
    humidity_percent: float
    rainfall_mm: float = 0.0
    rain_probability: float = 0.0
    weather_condition: str = "Clear"
    weather_description: str = "clear sky"


class DailyForecastItem(BaseModel):
    date_iso: str = Field(..., description="Date in YYYY-MM-DD format")
    day_label: str = Field(..., description="Today, Tomorrow, Day After, or weekday name")
    formatted_date: str = Field(..., description="Short date display e.g. Oct 6")
    temp_min_c: float = Field(..., description="Minimum daily temperature in °C")
    temp_max_c: float = Field(..., description="Maximum daily temperature in °C")
    temp_avg_c: float = Field(..., description="Average daily temperature in °C")
    rainfall_total_mm: float = Field(0.0, description="Total daily precipitation in mm")
    rain_probability_max: float = Field(0.0, description="Peak probability of precipitation (0.0 - 1.0)")
    weather_condition: str = Field("Clear", description="Dominant weather condition")
    weather_description: str = Field("clear sky", description="Dominant weather condition description")
    icon: str = Field("☀️", description="Agricultural weather emoji/icon")
    agri_risk_level: str = Field("Low", description="Agricultural abiotic risk level: Low, Moderate, High")
    agri_advice: str = Field("Favorable conditions", description="Short agronomic field advice")


class ForecastWeather(BaseModel):
    next_24h_rainfall_mm: float = Field(0.0, description="Expected total precipitation over next 24 hours")
    next_48h_rainfall_mm: float = Field(0.0, description="Expected total precipitation over next 48 hours")
    rain_probability: float = Field(0.0, description="Peak probability of precipitation (0.0 to 1.0)")
    rainfall_forecast_mm: float = Field(0.0, description="Forecast rainfall amount")
    summary: str = Field("Stable weather forecast.", description="Human-readable forecast summary")
    forecast_items: List[ForecastItem] = Field(default_factory=list)
    daily_forecast: List[DailyForecastItem] = Field(default_factory=list)


class AirQualityInfo(BaseModel):
    aqi: float = Field(50.0, description="Calculated standard AQI (0-500 scale)")
    aqi_index: int = Field(1, description="OpenWeather index scale (1=Good to 5=Very Poor)")
    aqi_category: str = Field("Good", description="Air quality category description")
    ozone: float = Field(0.035, description="Tropospheric ozone concentration in normalized ppm for SNN")
    ozone_ug_m3: float = Field(35.0, description="Raw ozone in ug/m3")
    pm25: float = Field(25.0, description="PM2.5 particulate in ug/m3")
    pm10: float = Field(45.0, description="PM10 particulate in ug/m3")
    co: Optional[float] = 0.0
    no2: Optional[float] = 0.0
    so2: Optional[float] = 0.0


class CanonicalWeatherResponse(BaseModel):
    location: LocationInfo
    observed_at: str
    current: CurrentWeather
    forecast: ForecastWeather
    air_quality: AirQualityInfo
    source: str = "OpenWeather"
    cached: bool = False
    cache_age_seconds: int = 0


class RegisteredField(BaseModel):
    field_id: str
    field_name: str
    zone_label: str
    latitude: float
    longitude: float
    crop_stage: str = "Flowering"
    days_since_sowing: int = 60
    soil_type: str = "Black Clay Loam"
