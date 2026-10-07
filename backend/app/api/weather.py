import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, status

from ..schemas.weather_schema import CanonicalWeatherResponse, RegisteredField
from ..services.weather_service import WeatherService, WeatherUnavailableError

logger = logging.getLogger("agrovision.weather_api")
router = APIRouter()


@router.get("/weather/current", response_model=CanonicalWeatherResponse, tags=["Weather & Environment"])
def get_current_weather(
    lat: float = Query(20.9750, description="Field latitude coordinate"),
    lon: float = Query(78.7200, description="Field longitude coordinate"),
    force_refresh: bool = Query(False, description="Force bypass in-memory TTL cache"),
):
    """
    Returns normalized live weather, 24h/48h forecast, and air pollution data
    from OpenWeather for the given field coordinates.
    Cached server-side for 15 minutes to respect API rate limits.
    """
    weather_service = WeatherService.get_instance()
    try:
        return weather_service.get_weather(latitude=lat, longitude=lon, force_refresh=force_refresh)
    except Exception as e:
        logger.warning(f"Returning station baseline telemetry due to error: {e}")
        return weather_service._build_station_baseline_weather(lat, lon)


@router.get("/weather/fields", response_model=List[RegisteredField], tags=["Weather & Environment"])
def list_registered_fields():
    """
    Returns the list of configured farm zones and parcels with stored coordinates
    so the dashboard does not ask farmers for GPS coordinates manually every time.
    """
    weather_service = WeatherService.get_instance()
    return weather_service.get_registered_fields()
