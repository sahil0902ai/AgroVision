from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserSettingsPayload(BaseModel):
    email: EmailStr = Field(..., description="Authenticated user email address")
    full_name: Optional[str] = Field(None, description="User full name")
    phone: Optional[str] = Field(None, description="Contact phone number or 'Not provided'")
    account_role: Optional[str] = Field("Lead Farmer", description="Role/Operator designation")
    farm_name: Optional[str] = Field(None, description="Registered farm / agricultural entity")
    farm_location: Optional[str] = Field(None, description="Geographic location / agricultural district")
    total_acreage: Optional[float] = Field(None, description="Total acreage under cultivation")
    
    # Field Preferences
    default_field_name: Optional[str] = Field("Field A — Wardha South Station", description="Default monitoring field")
    default_field_lat: Optional[float] = Field(20.975, description="Default latitude coordinate")
    default_field_lon: Optional[float] = Field(78.72, description="Default longitude coordinate")
    soil_type: Optional[str] = Field("Black Cotton Soil (Vertisol)", description="Primary soil classification")
    irrigation_type: Optional[str] = Field("Drip Irrigation", description="Primary irrigation methodology")
    temp_unit: Optional[str] = Field("Celsius (°C)", description="Temperature unit preference")
    rainfall_unit: Optional[str] = Field("Millimeters (mm)", description="Rainfall unit preference")
    moisture_unit: Optional[str] = Field("Percentage (%)", description="Soil moisture unit preference")
    
    # Notifications
    email_alerts: Optional[bool] = Field(True, description="Critical email alerts for stress detection")
    sms_alerts: Optional[bool] = Field(False, description="SMS notifications for high risk conditions")
    expert_veto_alerts: Optional[bool] = Field(True, description="Notifications on safety override triggers")
    daily_weather_digest: Optional[bool] = Field(True, description="Daily microclimate summary")
    weekly_report: Optional[bool] = Field(True, description="Weekly agronomic health report")
    
    # Data Preferences
    auto_telemetry_sync: Optional[bool] = Field(True, description="Auto-fetch live weather from OpenWeather")
    sqlite_caching: Optional[bool] = Field(True, description="Local database caching of analytical records")
    data_retention_days: Optional[int] = Field(365, description="Data retention duration in days")
    low_bandwidth_mode: Optional[bool] = Field(False, description="Compress leaf images for slow rural connections")
    
    # AI Assistant
    gemini_model: Optional[str] = Field("gemini-2.5-flash", description="AI reasoning engine model")
    ai_depth: Optional[str] = Field("Technical Agronomic", description="Explanation detail level")
    ai_grounding: Optional[str] = Field("Strict Deterministic Model & Veto Grounding", description="Grounding policy")
    auto_suggest_questions: Optional[bool] = Field(True, description="Contextual prompt suggestions in chat")
    
    # Language & Region
    language: Optional[str] = Field("English (Default)", description="Primary interface language")
    timezone: Optional[str] = Field("Asia/Kolkata (IST - UTC+5:30)", description="Station timezone")
    date_format: Optional[str] = Field("DD/MM/YYYY", description="Preferred date display format")
    
    # Security Preferences
    two_factor_enabled: Optional[bool] = Field(False, description="Two-factor authentication status")
    session_timeout_minutes: Optional[int] = Field(60, description="Session idle timeout duration")


class UserSettingsResponse(BaseModel):
    success: bool = True
    message: str = "Settings loaded successfully."
    settings: UserSettingsPayload
    last_updated: Optional[datetime] = None
