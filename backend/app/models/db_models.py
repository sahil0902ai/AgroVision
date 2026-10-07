from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    salt = Column(String, nullable=False)
    reset_code = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AnalysisRecordDB(Base):
    __tablename__ = "analysis_records"
    id = Column(Integer, primary_key=True, index=True)
    record_uuid = Column(String, unique=True, index=True, nullable=False)
    user_email = Column(String, index=True, nullable=True)
    field_name = Column(String, default="Field A — North Parcel")
    image_url = Column(String, nullable=False)
    heatmap_url = Column(String, nullable=True)
    
    # Environmental measurements used during inference
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    soil_moisture = Column(Float, nullable=False)
    rainfall_mm = Column(Float, default=0.0)
    forecast_rainfall_mm = Column(Float, default=0.0)
    aqi = Column(Float, default=50.0)
    ozone = Column(Float, default=40.0)
    growth_stage = Column(String, default="Flowering")
    
    # Model Outputs
    stress_severity = Column(String, nullable=False)  # High, Low, Moderate
    confidence_score = Column(Float, nullable=False)
    cnn_predictions_json = Column(Text, nullable=False)  # JSON string
    spike_counts_json = Column(Text, nullable=False)  # JSON string
    fusion_json = Column(Text, nullable=True)  # JSON string containing relationship & alignment
    expert_veto_json = Column(Text, nullable=True)  # JSON string containing triggered rules & status
    recommendations_json = Column(Text, nullable=False)  # JSON string
    
    # Full OpenWeather context snapshot at time of analysis
    weather_source = Column(String, default="OpenWeather")
    weather_context_json = Column(Text, nullable=True)  # Full CanonicalWeatherResponse JSON
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatMessageDB(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, default="anonymous", index=True)
    user_email = Column(String, index=True, nullable=True)
    record_uuid = Column(String, index=True, nullable=True)
    field_name = Column(String, default="Field A — North Parcel")
    message = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    model_used = Column(String, default="gemini-2.5-flash")
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSettingsDB(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    
    # Profile & Account
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    account_role = Column(String, default="Lead Farmer")
    farm_name = Column(String, nullable=True)
    farm_location = Column(String, nullable=True)
    total_acreage = Column(Float, nullable=True)
    
    # Field Preferences
    default_field_name = Column(String, default="Field A — Wardha South Station")
    default_field_lat = Column(Float, default=20.975)
    default_field_lon = Column(Float, default=78.72)
    soil_type = Column(String, default="Black Cotton Soil (Vertisol)")
    irrigation_type = Column(String, default="Drip Irrigation")
    temp_unit = Column(String, default="Celsius (°C)")
    rainfall_unit = Column(String, default="Millimeters (mm)")
    moisture_unit = Column(String, default="Percentage (%)")
    
    # Notifications
    email_alerts = Column(Integer, default=1)  # 1=True, 0=False
    sms_alerts = Column(Integer, default=0)
    expert_veto_alerts = Column(Integer, default=1)
    daily_weather_digest = Column(Integer, default=1)
    weekly_report = Column(Integer, default=1)
    
    # Data Preferences
    auto_telemetry_sync = Column(Integer, default=1)
    sqlite_caching = Column(Integer, default=1)
    data_retention_days = Column(Integer, default=365)
    low_bandwidth_mode = Column(Integer, default=0)
    
    # AI Assistant
    gemini_model = Column(String, default="gemini-2.5-flash")
    ai_depth = Column(String, default="Technical Agronomic")
    ai_grounding = Column(String, default="Strict Deterministic Model & Veto Grounding")
    auto_suggest_questions = Column(Integer, default=1)
    
    # Language & Region
    language = Column(String, default="English (Default)")
    timezone = Column(String, default="Asia/Kolkata (IST - UTC+5:30)")
    date_format = Column(String, default="DD/MM/YYYY")
    
    # Security Preferences
    two_factor_enabled = Column(Integer, default=0)
    session_timeout_minutes = Column(Integer, default=60)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

