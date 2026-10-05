from app.core.database import get_db
from app.models.db_models import AnalysisRecordDB
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter()

@router.get("/analytics/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    total_scans = db.query(func.count(AnalysisRecordDB.id)).scalar() or 0
    
    high_count = db.query(func.count(AnalysisRecordDB.id)).filter(AnalysisRecordDB.stress_severity == "High").scalar() or 0
    mod_count = db.query(func.count(AnalysisRecordDB.id)).filter(AnalysisRecordDB.stress_severity == "Moderate").scalar() or 0
    low_count = db.query(func.count(AnalysisRecordDB.id)).filter(AnalysisRecordDB.stress_severity == "Low").scalar() or 0

    avg_temp = db.query(func.avg(AnalysisRecordDB.temperature)).scalar() or 31.0
    avg_humidity = db.query(func.avg(AnalysisRecordDB.humidity)).scalar() or 72.0
    avg_soil = db.query(func.avg(AnalysisRecordDB.soil_moisture)).scalar() or 68.0

    return {
        "total_scans": total_scans,
        "severity_distribution": [
            {"name": "Low Stress", "value": low_count, "color": "#10B981"},
            {"name": "Moderate Stress", "value": mod_count, "color": "#F59E0B"},
            {"name": "High Stress", "value": high_count, "color": "#EF4444"}
        ],
        "environmental_averages": {
            "temperature_C": round(avg_temp, 1),
            "humidity_percent": round(avg_humidity, 1),
            "soil_moisture_percent": round(avg_soil, 1)
        }
    }
