from datetime import datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.db_models import UserSettingsDB
from ..schemas.settings_schema import UserSettingsPayload, UserSettingsResponse

logger = logging.getLogger("agrovision.settings_api")

router = APIRouter()


def _db_to_payload(db_obj: UserSettingsDB) -> UserSettingsPayload:
    return UserSettingsPayload(
        email=db_obj.email,
        full_name=db_obj.full_name,
        phone=db_obj.phone,
        account_role=db_obj.account_role or "Lead Farmer",
        farm_name=db_obj.farm_name,
        farm_location=db_obj.farm_location,
        total_acreage=db_obj.total_acreage,
        default_field_name=db_obj.default_field_name or "Field A — Wardha South Station",
        default_field_lat=db_obj.default_field_lat or 20.975,
        default_field_lon=db_obj.default_field_lon or 78.72,
        soil_type=db_obj.soil_type or "Black Cotton Soil (Vertisol)",
        irrigation_type=db_obj.irrigation_type or "Drip Irrigation",
        temp_unit=db_obj.temp_unit or "Celsius (°C)",
        rainfall_unit=db_obj.rainfall_unit or "Millimeters (mm)",
        moisture_unit=db_obj.moisture_unit or "Percentage (%)",
        email_alerts=bool(db_obj.email_alerts),
        sms_alerts=bool(db_obj.sms_alerts),
        expert_veto_alerts=bool(db_obj.expert_veto_alerts),
        daily_weather_digest=bool(db_obj.daily_weather_digest),
        weekly_report=bool(db_obj.weekly_report),
        auto_telemetry_sync=bool(db_obj.auto_telemetry_sync),
        sqlite_caching=bool(db_obj.sqlite_caching),
        data_retention_days=db_obj.data_retention_days or 365,
        low_bandwidth_mode=bool(db_obj.low_bandwidth_mode),
        gemini_model=db_obj.gemini_model or "gemini-2.5-flash",
        ai_depth=db_obj.ai_depth or "Technical Agronomic",
        ai_grounding=db_obj.ai_grounding or "Strict Deterministic Model & Veto Grounding",
        auto_suggest_questions=bool(db_obj.auto_suggest_questions),
        language=db_obj.language or "English (Default)",
        timezone=db_obj.timezone or "Asia/Kolkata (IST - UTC+5:30)",
        date_format=db_obj.date_format or "DD/MM/YYYY",
        two_factor_enabled=bool(db_obj.two_factor_enabled),
        session_timeout_minutes=db_obj.session_timeout_minutes or 60,
    )


@router.get(
    "/settings",
    response_model=UserSettingsResponse,
    summary="Retrieve user preferences and configuration",
)
def get_user_settings(
    email: str = Query(..., description="Authenticated user email"),
    db: Session = Depends(get_db),
):
    """
    Retrieve stored preferences for the given authenticated user.
    If no prior preferences exist in SQLite, returns clean default configuration.
    """
    clean_email = email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email parameter required.",
        )

    db_settings = (
        db.query(UserSettingsDB).filter(UserSettingsDB.email == clean_email).first()
    )

    if not db_settings:
        # Return default initialized configuration for user
        default_payload = UserSettingsPayload(
            email=clean_email,
            full_name=None,
            phone=None,
            account_role="Lead Farmer",
            farm_name=None,
            farm_location=None,
            total_acreage=None,
        )
        return UserSettingsResponse(
            success=True,
            message="Default preferences loaded for operator session.",
            settings=default_payload,
            last_updated=None,
        )

    return UserSettingsResponse(
        success=True,
        message="Settings retrieved from database.",
        settings=_db_to_payload(db_settings),
        last_updated=db_settings.updated_at or db_settings.created_at,
    )


@router.post(
    "/settings",
    response_model=UserSettingsResponse,
    summary="Save user preferences and configuration",
)
@router.put(
    "/settings",
    response_model=UserSettingsResponse,
    summary="Update user preferences and configuration",
)
def save_user_settings(
    payload: UserSettingsPayload,
    db: Session = Depends(get_db),
):
    """
    Persist or update authenticated user preferences into the database.
    """
    clean_email = payload.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email address is required.",
        )

    db_settings = (
        db.query(UserSettingsDB).filter(UserSettingsDB.email == clean_email).first()
    )

    if not db_settings:
        db_settings = UserSettingsDB(
            email=clean_email,
            created_at=datetime.utcnow(),
        )
        db.add(db_settings)

    # Update fields
    db_settings.full_name = payload.full_name.strip() if payload.full_name else None
    db_settings.phone = payload.phone.strip() if payload.phone else None
    db_settings.account_role = payload.account_role or "Lead Farmer"
    db_settings.farm_name = payload.farm_name.strip() if payload.farm_name else None
    db_settings.farm_location = payload.farm_location.strip() if payload.farm_location else None
    db_settings.total_acreage = payload.total_acreage

    db_settings.default_field_name = payload.default_field_name or "Field A — Wardha South Station"
    db_settings.default_field_lat = payload.default_field_lat or 20.975
    db_settings.default_field_lon = payload.default_field_lon or 78.72
    db_settings.soil_type = payload.soil_type or "Black Cotton Soil (Vertisol)"
    db_settings.irrigation_type = payload.irrigation_type or "Drip Irrigation"
    db_settings.temp_unit = payload.temp_unit or "Celsius (°C)"
    db_settings.rainfall_unit = payload.rainfall_unit or "Millimeters (mm)"
    db_settings.moisture_unit = payload.moisture_unit or "Percentage (%)"

    db_settings.email_alerts = 1 if payload.email_alerts else 0
    db_settings.sms_alerts = 1 if payload.sms_alerts else 0
    db_settings.expert_veto_alerts = 1 if payload.expert_veto_alerts else 0
    db_settings.daily_weather_digest = 1 if payload.daily_weather_digest else 0
    db_settings.weekly_report = 1 if payload.weekly_report else 0

    db_settings.auto_telemetry_sync = 1 if payload.auto_telemetry_sync else 0
    db_settings.sqlite_caching = 1 if payload.sqlite_caching else 0
    db_settings.data_retention_days = payload.data_retention_days or 365
    db_settings.low_bandwidth_mode = 1 if payload.low_bandwidth_mode else 0

    db_settings.gemini_model = payload.gemini_model or "gemini-2.5-flash"
    db_settings.ai_depth = payload.ai_depth or "Technical Agronomic"
    db_settings.ai_grounding = payload.ai_grounding or "Strict Deterministic Model & Veto Grounding"
    db_settings.auto_suggest_questions = 1 if payload.auto_suggest_questions else 0

    db_settings.language = payload.language or "English (Default)"
    db_settings.timezone = payload.timezone or "Asia/Kolkata (IST - UTC+5:30)"
    db_settings.date_format = payload.date_format or "DD/MM/YYYY"

    db_settings.two_factor_enabled = 1 if payload.two_factor_enabled else 0
    db_settings.session_timeout_minutes = payload.session_timeout_minutes or 60
    db_settings.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_settings)

    logger.info(f"Saved preferences for user '{clean_email}' in SQLite database.")

    return UserSettingsResponse(
        success=True,
        message="Preferences saved successfully to database.",
        settings=_db_to_payload(db_settings),
        last_updated=db_settings.updated_at,
    )
