import json
from datetime import datetime, timedelta
from typing import Any, Optional

try:
    from app.core.database import get_db
    from app.models.db_models import AnalysisRecordDB
except ImportError:
    from ....core.database import get_db
    from ....models.db_models import AnalysisRecordDB
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("/analytics/summary")
def get_analytics_summary(
    user_email: Optional[str] = Query(None, description="Filter summary by authenticated user email"),
    db: Session = Depends(get_db)
):
    query = db.query(AnalysisRecordDB)
    if isinstance(user_email, str) and user_email.strip():
        query = query.filter(AnalysisRecordDB.user_email == user_email.strip().lower())

    total_scans = query.count()

    high_query = query.filter(AnalysisRecordDB.stress_severity == "High")
    mod_query = query.filter(AnalysisRecordDB.stress_severity == "Moderate")
    low_query = query.filter(AnalysisRecordDB.stress_severity == "Low")

    high_count = high_query.count()
    mod_count = mod_query.count()
    low_count = low_query.count()

    avg_temp = query.with_entities(func.avg(AnalysisRecordDB.temperature)).scalar()
    avg_humidity = query.with_entities(func.avg(AnalysisRecordDB.humidity)).scalar()
    avg_soil = query.with_entities(func.avg(AnalysisRecordDB.soil_moisture)).scalar()

    return {
        "total_scans": total_scans,
        "severity_distribution": [
            {"name": "Low Stress", "value": low_count, "color": "#10B981"},
            {"name": "Moderate Stress", "value": mod_count, "color": "#F59E0B"},
            {"name": "High Stress", "value": high_count, "color": "#EF4444"}
        ],
        "environmental_averages": {
            "temperature_C": round(avg_temp, 1) if avg_temp is not None else 0.0,
            "humidity_percent": round(avg_humidity, 1) if avg_humidity is not None else 0.0,
            "soil_moisture_percent": round(avg_soil, 1) if avg_soil is not None else 0.0
        }
    }


@router.get("/analytics/trend")
def get_analytics_trend(
    period: str = Query("30d", description="Filter period: 7d, 30d, 90d, or custom"),
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD) for custom filter"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD) for custom filter"),
    user_email: Optional[str] = Query(None, description="Filter trend by authenticated user email"),
    db: Session = Depends(get_db)
):
    """
    Retrieves historical analysis counts and trends grouped by date from the database.
    Separates counts into 'Healthy' and 'Stressed' series.
    Returns has_sufficient_data: false if there are no records in the requested timeframe.
    """
    now = datetime.utcnow()
    
    # Calculate date range
    if period == "7d":
        start_dt = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "90d":
        start_dt = (now - timedelta(days=89)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "custom" and start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.strip()).replace(hour=0, minute=0, second=0, microsecond=0)
        except ValueError:
            start_dt = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.strip()).replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        else:
            end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    else:  # default "30d"
        period = "30d"
        start_dt = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    query = db.query(AnalysisRecordDB).filter(
        AnalysisRecordDB.created_at >= start_dt,
        AnalysisRecordDB.created_at <= end_dt
    )
    if isinstance(user_email, str) and user_email.strip():
        query = query.filter(AnalysisRecordDB.user_email == user_email.strip().lower())

    records = query.order_by(AnalysisRecordDB.created_at.asc()).all()

    total_records = len(records)
    if total_records == 0:
        return {
            "period": period,
            "start_date": start_dt.strftime("%Y-%m-%d"),
            "end_date": end_dt.strftime("%Y-%m-%d"),
            "total_records": 0,
            "has_sufficient_data": False,
            "message": "Not enough data for trend analysis",
            "data_points": [],
            "series": {
                "dates": [],
                "iso_dates": [],
                "healthy": [],
                "stressed": [],
                "total": []
            },
            "summary": {
                "healthy_total": 0,
                "stressed_total": 0,
                "total": 0
            }
        }

    # Aggregate by day
    # Pre-populate all days in the range so the line chart shows a continuous timeline
    days_span = (end_dt.date() - start_dt.date()).days + 1
    date_map = {}
    
    # Pre-create entries for days in range
    for i in range(days_span):
        d = start_dt.date() + timedelta(days=i)
        d_str = d.strftime("%Y-%m-%d")
        date_map[d_str] = {
            "date": d_str,
            "label": d.strftime("%b %d"),
            "day_name": d.strftime("%a"),
            "healthy": 0,
            "stressed": 0,
            "total": 0
        }

    healthy_sum = 0
    stressed_sum = 0

    for r in records:
        if not r.created_at:
            continue
        d_str = r.created_at.strftime("%Y-%m-%d")
        if d_str not in date_map:
            date_map[d_str] = {
                "date": d_str,
                "label": r.created_at.strftime("%b %d"),
                "day_name": r.created_at.strftime("%a"),
                "healthy": 0,
                "stressed": 0,
                "total": 0
            }

        # Check visual / stress classification
        is_healthy = False
        top_class = ""
        if r.cnn_predictions_json:
            try:
                cnn_obj = json.loads(r.cnn_predictions_json)
                if isinstance(cnn_obj, dict) and cnn_obj:
                    top_class = max(cnn_obj, key=cnn_obj.get).lower()
                    if top_class == "healthy":
                        is_healthy = True
            except Exception:
                pass
        
        # Fallback to SNN severity if CNN is absent
        if not top_class:
            if (r.stress_severity or "").lower() == "low":
                is_healthy = True

        if is_healthy:
            date_map[d_str]["healthy"] += 1
            healthy_sum += 1
        else:
            date_map[d_str]["stressed"] += 1
            stressed_sum += 1
        
        date_map[d_str]["total"] += 1

    # Sorted list of aggregated data points
    sorted_days = sorted(date_map.keys())
    data_points = [date_map[k] for k in sorted_days]

    dates_list = [date_map[k]["label"] for k in sorted_days]
    iso_dates_list = [date_map[k]["date"] for k in sorted_days]
    healthy_series = [date_map[k]["healthy"] for k in sorted_days]
    stressed_series = [date_map[k]["stressed"] for k in sorted_days]
    total_series = [date_map[k]["total"] for k in sorted_days]

    return {
        "period": period,
        "start_date": start_dt.strftime("%Y-%m-%d"),
        "end_date": end_dt.strftime("%Y-%m-%d"),
        "total_records": total_records,
        "has_sufficient_data": total_records >= 1,
        "message": "Data available" if total_records >= 1 else "Not enough data for trend analysis",
        "data_points": data_points,
        "series": {
            "dates": dates_list,
            "iso_dates": iso_dates_list,
            "healthy": healthy_series,
            "stressed": stressed_series,
            "total": total_series
        },
        "summary": {
            "healthy_total": healthy_sum,
            "stressed_total": stressed_sum,
            "total": total_records
        }
    }


@router.get("/analytics/visual-distribution")
def get_visual_stress_distribution(
    user_email: Optional[str] = Query(None, description="Filter by authenticated user email"),
    db: Session = Depends(get_db)
):
    """
    Retrieves the aggregate visual stress distribution (CNN 5 classes)
    across historical database analysis records.
    Never fabricates random data.
    """
    query = db.query(AnalysisRecordDB)
    if isinstance(user_email, str) and user_email.strip():
        query = query.filter(AnalysisRecordDB.user_email == user_email.strip().lower())
    records = query.all()
    total_analyses = len(records)

    categories_config = [
        {"key": "healthy", "name": "Healthy", "color": "#059669"},
        {"key": "water_stress", "name": "Water Stress", "color": "#2563eb"},
        {"key": "heat_stress", "name": "Heat Stress", "color": "#ea580c"},
        {"key": "nutrient_deficiency", "name": "Nutrient Deficiency", "color": "#d97706"},
        {"key": "pollution", "name": "Pollution", "color": "#7c3aed"}
    ]

    counts = {cat["key"]: 0 for cat in categories_config}

    for r in records:
        top_class = ""
        if r.cnn_predictions_json:
            try:
                cnn_obj = json.loads(r.cnn_predictions_json)
                if isinstance(cnn_obj, dict) and cnn_obj:
                    top_class = max(cnn_obj, key=cnn_obj.get).lower().strip()
            except Exception:
                pass
        
        if not top_class:
            sev = (r.stress_severity or "").lower()
            if sev == "low":
                top_class = "healthy"
            elif sev == "high":
                top_class = "water_stress"
            else:
                top_class = "nutrient_deficiency"

        if top_class in counts:
            counts[top_class] += 1
        elif "water" in top_class:
            counts["water_stress"] += 1
        elif "heat" in top_class:
            counts["heat_stress"] += 1
        elif "nutrient" in top_class:
            counts["nutrient_deficiency"] += 1
        elif "pollution" in top_class:
            counts["pollution"] += 1
        else:
            counts["healthy"] += 1

    categories_result = []
    for cat in categories_config:
        count = counts[cat["key"]]
        pct = round((count / total_analyses) * 100, 1) if total_analyses > 0 else 0.0
        categories_result.append({
            "key": cat["key"],
            "name": cat["name"],
            "count": count,
            "percentage": pct,
            "color": cat["color"]
        })

    return {
        "total_analyses": total_analyses,
        "has_data": total_analyses > 0,
        "message": "Success" if total_analyses > 0 else "No visual scan data recorded yet",
        "categories": categories_result
    }


@router.get("/analytics/environmental-distribution")
def get_environmental_stress_distribution(
    user_email: Optional[str] = Query(None, description="Filter by authenticated user email"),
    db: Session = Depends(get_db)
):
    """
    Retrieves aggregate SNN environmental stress distribution (Low, Moderate, High)
    from historical database records.
    Never fabricates random data.
    """
    query = db.query(AnalysisRecordDB)
    if isinstance(user_email, str) and user_email.strip():
        query = query.filter(AnalysisRecordDB.user_email == user_email.strip().lower())

    total = query.count()
    
    low_count = query.filter(AnalysisRecordDB.stress_severity.ilike("Low")).count()
    mod_count = query.filter(AnalysisRecordDB.stress_severity.ilike("Moderate")).count()
    high_count = query.filter(AnalysisRecordDB.stress_severity.ilike("High")).count()

    categories = [
        {
            "key": "low",
            "name": "Low",
            "label": "Low Risk",
            "count": low_count,
            "percentage": round((low_count / total) * 100, 1) if total > 0 else 0.0,
            "color": "#059669"
        },
        {
            "key": "moderate",
            "name": "Moderate",
            "label": "Moderate Risk",
            "count": mod_count,
            "percentage": round((mod_count / total) * 100, 1) if total > 0 else 0.0,
            "color": "#d97706"
        },
        {
            "key": "high",
            "name": "High",
            "label": "High Risk",
            "count": high_count,
            "percentage": round((high_count / total) * 100, 1) if total > 0 else 0.0,
            "color": "#dc2626"
        }
    ]

    return {
        "total_analyses": total,
        "has_data": total > 0,
        "message": "Success" if total > 0 else "No environmental analyses yet.",
        "categories": categories
    }
