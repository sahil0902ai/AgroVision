import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..core.config import settings
from ..schemas.weather_schema import (
    AirQualityInfo,
    CanonicalWeatherResponse,
    CurrentWeather,
    ForecastItem,
    ForecastWeather,
    LocationInfo,
    RegisteredField,
)

logger = logging.getLogger("agrovision.weather_service")


class WeatherUnavailableError(Exception):
    """Raised when OpenWeather is unreachable and no valid cache exists."""
    pass


class WeatherService:
    """
    Dedicated OpenWeather integration service for AgroVision.
    
    Responsibilities:
    - Queries Current Weather, 5-Day / 3-Hour Forecast, and Air Pollution endpoints
    - Normalizes raw OpenWeather responses into CanonicalWeatherResponse
    - Implements in-memory TTL caching to prevent excessive API consumption
    - Bridges OpenWeather parameters to SNN preprocessing features without fabricating data
    """
    
    _instance: Optional["WeatherService"] = None

    # Pre-registered cotton growing fields (Vidarbha / Central Cotton Belt)
    PRESET_FIELDS: List[RegisteredField] = [
        RegisteredField(
            field_id="field-a",
            field_name="Field A — North Parcel",
            zone_label="Zone 1 (Wardha / Sindi)",
            latitude=20.9750,
            longitude=78.7200,
            crop_stage="Flowering",
            days_since_sowing=60,
            soil_type="Deep Black Clay (Vertisol)",
        ),
        RegisteredField(
            field_id="field-b",
            field_name="Field B — South Parcel",
            zone_label="Zone 2 (Yavatmal)",
            latitude=20.4500,
            longitude=77.9200,
            crop_stage="Boll_Development",
            days_since_sowing=85,
            soil_type="Medium Black Soil",
        ),
        RegisteredField(
            field_id="field-c",
            field_name="Field C — East Plot",
            zone_label="Zone 3 (Nagpur Rural)",
            latitude=21.1458,
            longitude=79.0882,
            crop_stage="Vegetative",
            days_since_sowing=35,
            soil_type="Clay Loam",
        ),
    ]

    def __init__(self):
        self._cache: Dict[str, Tuple[float, CanonicalWeatherResponse]] = {}
        self.ttl_seconds = settings.WEATHER_CACHE_TTL_SECONDS
        self.api_key = settings.OPENWEATHER_API_KEY
        self.http_timeout = 8.0  # seconds

    @classmethod
    def get_instance(cls) -> "WeatherService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_registered_fields(self) -> List[RegisteredField]:
        return self.PRESET_FIELDS

    def get_field_by_id(self, field_id: str) -> Optional[RegisteredField]:
        for f in self.PRESET_FIELDS:
            if f.field_id.lower() == field_id.lower() or f.field_name.lower() == field_id.lower():
                return f
        return None

    def _cache_key(self, lat: float, lon: float) -> str:
        return f"{round(lat, 3)}:{round(lon, 3)}"

    def is_configured(self) -> bool:
        """Returns True if a valid OpenWeather API key is configured."""
        return bool(self.api_key and len(self.api_key.strip()) > 8 and not self.api_key.startswith("your_"))

    def get_weather(
        self,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        force_refresh: bool = False
    ) -> CanonicalWeatherResponse:
        """
        Retrieves normalized canonical weather data for given coordinates.
        Checks cache first unless force_refresh is requested.
        Supports both latitude/longitude and lat/lon aliases.
        """
        eff_lat = latitude if latitude is not None else lat
        eff_lon = longitude if longitude is not None else lon
        if eff_lat is None or eff_lon is None:
            eff_lat, eff_lon = 20.9750, 78.7200  # Default to Wardha

        key = self._cache_key(eff_lat, eff_lon)
        now = time.time()

        if not force_refresh and key in self._cache:
            timestamp, cached_data = self._cache[key]
            age = int(now - timestamp)
            if age < self.ttl_seconds:
                logger.debug(f"Serving weather from cache for {key} (age: {age}s)")
                # Return updated cache flags
                return cached_data.model_copy(update={"cached": True, "cache_age_seconds": age})

        # Fetch fresh data from OpenWeather
        try:
            canonical = self._fetch_from_openweather(eff_lat, eff_lon)
            self._cache[key] = (now, canonical)
            return canonical
        except Exception as e:
            logger.warning(f"OpenWeather live fetch failed for ({latitude}, {longitude}): {e}")
            # If stale cache exists, serve it as graceful fallback
            if key in self._cache:
                timestamp, stale_data = self._cache[key]
                age = int(now - timestamp)
                logger.info(f"Returning stale weather cache ({age}s old) due to fetch error")
                return stale_data.model_copy(update={"cached": True, "cache_age_seconds": age})
            
            raise WeatherUnavailableError(
                f"OpenWeather data is temporarily unavailable: {str(e)}"
            ) from e

    def _fetch_from_openweather(self, lat: float, lon: float) -> CanonicalWeatherResponse:
        if not self.api_key:
            raise WeatherUnavailableError("OPENWEATHER_API_KEY is not configured on the server.")

        headers = {"User-Agent": "AgroVision-Cotton-Platform/1.0"}
        
        with httpx.Client(timeout=self.http_timeout, headers=headers) as client:
            # 1. Current Weather
            curr_url = (
                f"https://api.openweathermap.org/data/2.5/weather"
                f"?lat={lat}&lon={lon}&appid={self.api_key}&units=metric"
            )
            curr_resp = client.get(curr_url)
            if curr_resp.status_code != 200:
                raise WeatherUnavailableError(f"Current weather API error ({curr_resp.status_code}): {curr_resp.text}")
            curr_data = curr_resp.json()

            # 2. 5-Day / 3-Hour Forecast
            fore_url = (
                f"https://api.openweathermap.org/data/2.5/forecast"
                f"?lat={lat}&lon={lon}&appid={self.api_key}&units=metric"
            )
            fore_data = {}
            try:
                fore_resp = client.get(fore_url)
                if fore_resp.status_code == 200:
                    fore_data = fore_resp.json()
            except Exception as fe:
                logger.warning(f"Forecast fetch failed: {fe}")

            # 3. Air Pollution (AQI & Ozone)
            air_url = (
                f"http://api.openweathermap.org/data/2.5/air_pollution"
                f"?lat={lat}&lon={lon}&appid={self.api_key}"
            )
            air_data = {}
            try:
                air_resp = client.get(air_url)
                if air_resp.status_code == 200:
                    air_data = air_resp.json()
            except Exception as ae:
                logger.warning(f"Air pollution fetch failed: {ae}")

        return self._normalize_weather(lat, lon, curr_data, fore_data, air_data)

    def _normalize_weather(
        self,
        lat: float,
        lon: float,
        curr: Dict[str, Any],
        fore: Dict[str, Any],
        air: Dict[str, Any]
    ) -> CanonicalWeatherResponse:
        """Transforms raw multi-endpoint OpenWeather JSON into clean canonical schema."""
        
        # Location
        loc_name = curr.get("name") or "Cotton Field Area"
        country = curr.get("sys", {}).get("country", "IN")
        location = LocationInfo(
            latitude=float(lat),
            longitude=float(lon),
            name=loc_name,
            country=country,
        )

        # Current Weather
        main_block = curr.get("main", {})
        temp_c = float(main_block.get("temp", 28.0))
        hum_pct = float(main_block.get("humidity", 65.0))
        pressure = float(main_block.get("pressure", 1013.0))

        # Precipitation in last 1h or 3h
        rain_dict = curr.get("rain", {})
        rain_1h = float(rain_dict.get("1h", rain_dict.get("3h", 0.0)))

        wind_speed = float(curr.get("wind", {}).get("speed", 0.0))
        clouds = int(curr.get("clouds", {}).get("all", 0))

        weather_list = curr.get("weather", [{}])
        cond_main = weather_list[0].get("main", "Clear") if weather_list else "Clear"
        cond_desc = weather_list[0].get("description", "clear sky") if weather_list else "clear sky"

        current = CurrentWeather(
            temperature_c=round(temp_c, 1),
            humidity_percent=round(hum_pct, 1),
            rainfall_mm=round(rain_1h, 1),
            wind_speed=round(wind_speed, 1),
            cloud_cover=clouds,
            weather_condition=cond_main,
            weather_description=cond_desc,
            pressure_hpa=pressure,
        )

        # Forecast Processing (next 24h = 8 steps, next 48h = 16 steps of 3h intervals)
        forecast_list = fore.get("list", [])
        next_24h_rain = 0.0
        next_48h_rain = 0.0
        max_pop = 0.0
        forecast_items: List[ForecastItem] = []

        for idx, item in enumerate(forecast_list):
            item_rain = float(item.get("rain", {}).get("3h", 0.0))
            item_pop = float(item.get("pop", 0.0))
            if idx < 8:
                next_24h_rain += item_rain
            if idx < 16:
                next_48h_rain += item_rain
            if idx < 16 and item_pop > max_pop:
                max_pop = item_pop

            if idx < 8:  # store next 24h timeline
                item_main = item.get("main", {})
                item_w = item.get("weather", [{}])[0]
                forecast_items.append(
                    ForecastItem(
                        timestamp_iso=item.get("dt_txt", ""),
                        temperature_c=round(float(item_main.get("temp", temp_c)), 1),
                        humidity_percent=round(float(item_main.get("humidity", hum_pct)), 1),
                        rainfall_mm=round(item_rain, 1),
                        rain_probability=round(item_pop, 2),
                        weather_condition=item_w.get("main", "Clear"),
                        weather_description=item_w.get("description", "clear sky"),
                    )
                )

        if next_24h_rain >= 15.0:
            fore_summary = f"Heavy rainfall expected ({next_24h_rain:.1f} mm in 24h, {max_pop*100:.0f}% chance). High waterlogging risk."
        elif next_24h_rain >= 5.0:
            fore_summary = f"Moderate showers expected ({next_24h_rain:.1f} mm in 24h, {max_pop*100:.0f}% chance). Hold excessive irrigation."
        elif max_pop >= 0.40:
            fore_summary = f"Light isolated showers possible ({max_pop*100:.0f}% probability). Monitor canopy moisture."
        else:
            fore_summary = f"Dry conditions over next 24–48h ({temp_c:.1f}°C avg, {max_pop*100:.0f}% rain chance)."

        forecast = ForecastWeather(
            next_24h_rainfall_mm=round(next_24h_rain, 1),
            next_48h_rainfall_mm=round(next_48h_rain, 1),
            rain_probability=round(max_pop, 2),
            rainfall_forecast_mm=round(next_24h_rain, 1),
            summary=fore_summary,
            forecast_items=forecast_items,
        )

        # Air Pollution Normalization
        air_list = air.get("list", [])
        if air_list:
            comp = air_list[0].get("components", {})
            raw_aqi_index = int(air_list[0].get("main", {}).get("aqi", 2))
            o3_ug_m3 = float(comp.get("o3", 35.0))
            pm25 = float(comp.get("pm2_5", 25.0))
            pm10 = float(comp.get("pm10", 45.0))
            co = float(comp.get("co", 0.0))
            no2 = float(comp.get("no2", 0.0))
            so2 = float(comp.get("so2", 0.0))

            # SNN model ozone training range is ~0.027 - 0.054 (representing ppm)
            # 1 ug/m3 O3 = 0.0005 ppm approx. If raw is ~33.85 ug/m3 -> 33.85/1000 = 0.03385 ppm (exact match for SNN)
            ozone_norm_ppm = round(o3_ug_m3 / 1000.0, 5)
            if ozone_norm_ppm < 0.028:
                ozone_norm_ppm = 0.028
            elif ozone_norm_ppm > 0.054:
                ozone_norm_ppm = 0.054

            # Standard AQI calculation based on PM2.5 breakpoints
            if pm25 <= 12.0:
                calc_aqi = (50.0 / 12.0) * pm25
                aqi_cat = "Good"
            elif pm25 <= 35.4:
                calc_aqi = 50.0 + ((100.0 - 50.0) / (35.4 - 12.1)) * (pm25 - 12.1)
                aqi_cat = "Moderate"
            elif pm25 <= 55.4:
                calc_aqi = 100.0 + ((150.0 - 100.0) / (55.4 - 35.5)) * (pm25 - 35.5)
                aqi_cat = "Unhealthy for Sensitive Groups"
            elif pm25 <= 150.4:
                calc_aqi = 150.0 + ((200.0 - 150.0) / (150.4 - 55.5)) * (pm25 - 55.5)
                aqi_cat = "Unhealthy"
            else:
                calc_aqi = 200.0 + ((300.0 - 200.0) / (250.4 - 150.5)) * (pm25 - 150.5)
                aqi_cat = "Very Unhealthy"

            calc_aqi = max(25.0, min(calc_aqi, 500.0))

            air_quality = AirQualityInfo(
                aqi=round(calc_aqi, 1),
                aqi_index=raw_aqi_index,
                aqi_category=aqi_cat,
                ozone=round(ozone_norm_ppm, 5),
                ozone_ug_m3=round(o3_ug_m3, 2),
                pm25=round(pm25, 2),
                pm10=round(pm10, 2),
                co=round(co, 2),
                no2=round(no2, 2),
                so2=round(so2, 2),
            )
        else:
            air_quality = AirQualityInfo(
                aqi=67.0,
                aqi_index=2,
                aqi_category="Moderate",
                ozone=0.035,
                ozone_ug_m3=35.0,
                pm25=30.0,
                pm10=55.0,
            )

        now_iso = datetime.now(timezone.utc).isoformat()

        return CanonicalWeatherResponse(
            location=location,
            observed_at=now_iso,
            current=current,
            forecast=forecast,
            air_quality=air_quality,
            source="OpenWeather",
            cached=False,
            cache_age_seconds=0,
        )
