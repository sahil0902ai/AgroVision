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


class AnalysisRecordDB(Base):
    __tablename__ = "analysis_records"
    id = Column(Integer, primary_key=True, index=True)
    record_uuid = Column(String, unique=True, index=True, nullable=False)
    image_url = Column(String, nullable=False)
    heatmap_url = Column(String, nullable=True)
    temperature = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    soil_moisture = Column(Float, nullable=False)
    rainfall_mm = Column(Float, default=0.0)
    aqi = Column(Float, default=50.0)
    ozone = Column(Float, default=40.0)
    growth_stage = Column(String, default="Flowering")
    stress_severity = Column(String, nullable=False)  # High, Low, Moderate
    confidence_score = Column(Float, nullable=False)
    cnn_predictions_json = Column(Text, nullable=False)  # JSON string
    spike_counts_json = Column(Text, nullable=False)  # JSON string
    fusion_json = Column(Text, nullable=True)  # JSON string containing relationship & alignment
    expert_veto_json = Column(Text, nullable=True)  # JSON string containing triggered rules & status
    recommendations_json = Column(Text, nullable=False)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)
