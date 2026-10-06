import csv
import io
import json
from datetime import datetime
from typing import Any

from app.core.database import get_db
from app.models.db_models import AnalysisRecordDB
from app.models.schemas import AnalysisRecordResponseSchema
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter()


@router.get("/records", response_model=list[AnalysisRecordResponseSchema])
def get_records(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    stress_severity: str | None = Query(None, description="Filter by SNN stress severity (High, Low, Moderate)"),
    growth_stage: str | None = Query(None, description="Filter by crop growth stage"),
    search: str | None = Query(None, description="Search by record UUID or keywords"),
    start_date: str | None = Query(None, description="Filter from ISO date YYYY-MM-DD"),
    end_date: str | None = Query(None, description="Filter to ISO date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """
    Retrieves filtered historical analysis records ordered by latest first.
    """
    query = db.query(AnalysisRecordDB)

    if stress_severity:
        query = query.filter(AnalysisRecordDB.stress_severity.ilike(stress_severity.strip()))

    if growth_stage:
        query = query.filter(AnalysisRecordDB.growth_stage.ilike(growth_stage.strip()))

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            (AnalysisRecordDB.record_uuid.ilike(search_term)) |
            (AnalysisRecordDB.stress_severity.ilike(search_term))
        )

    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.filter(AnalysisRecordDB.created_at >= start_dt)
        except ValueError:
            pass

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.filter(AnalysisRecordDB.created_at <= end_dt)
        except ValueError:
            pass

    records = query.order_by(AnalysisRecordDB.created_at.desc()).offset(skip).limit(limit).all()
    return records


@router.get("/records/export/csv")
def export_records_csv(
    stress_severity: str | None = Query(None),
    growth_stage: str | None = Query(None),
    db: Session = Depends(get_db)
):
    """
    Exports filtered or complete historical analysis records as a structured CSV file.
    """
    query = db.query(AnalysisRecordDB)
    if stress_severity:
        query = query.filter(AnalysisRecordDB.stress_severity.ilike(stress_severity.strip()))
    if growth_stage:
        query = query.filter(AnalysisRecordDB.growth_stage.ilike(growth_stage.strip()))

    records = query.order_by(AnalysisRecordDB.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "Record UUID",
        "Field Name",
        "Timestamp (UTC)",
        "Temperature (°C)",
        "Humidity (%)",
        "Observed Rainfall (mm)",
        "Forecast Rainfall (mm)",
        "Soil Moisture (m³/m³)",
        "AQI",
        "Ozone",
        "Weather Source",
        "Growth Stage",
        "SNN Stress Severity",
        "SNN Confidence (%)",
        "Top CNN Class",
        "Top CNN Probability (%)",
        "Image URL",
        "Heatmap URL",
        "Triggered Expert Rules"
    ])

    for r in records:
        # Extract top CNN class
        top_cnn_class = "Unknown"
        top_cnn_pct = 0.0
        try:
            if r.cnn_predictions_json:
                cnn_dict = json.loads(r.cnn_predictions_json)
                if cnn_dict:
                    top_key = max(cnn_dict, key=cnn_dict.get)
                    top_cnn_class = top_key.replace("_", " ").title()
                    top_cnn_pct = float(cnn_dict[top_key])
        except Exception:
            pass

        # Extract recommendations
        recs_str = ""
        try:
            if r.recommendations_json:
                recs_list = json.loads(r.recommendations_json)
                if isinstance(recs_list, list):
                    recs_str = " | ".join(str(item) for item in recs_list)
        except Exception:
            pass

        writer.writerow([
            r.record_uuid,
            getattr(r, "field_name", "Field A — North Parcel") or "Field A — North Parcel",
            r.created_at.isoformat() if r.created_at else "",
            f"{r.temperature:.1f}",
            f"{r.humidity:.1f}",
            f"{r.rainfall_mm:.1f}",
            f"{getattr(r, 'forecast_rainfall_mm', 0.0):.1f}",
            f"{r.soil_moisture:.3f}",
            f"{r.aqi:.0f}",
            f"{r.ozone:.3f}",
            getattr(r, "weather_source", "OpenWeather") or "OpenWeather",
            r.growth_stage,
            r.stress_severity,
            f"{r.confidence_score:.1f}",
            top_cnn_class,
            f"{top_cnn_pct:.1f}",
            r.image_url,
            r.heatmap_url or "",
            recs_str
        ])

    output.seek(0)
    filename = f"agrovision_analysis_records_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/records/{record_identifier}", response_model=AnalysisRecordResponseSchema)
def get_record(record_identifier: str, db: Session = Depends(get_db)):
    """
    Retrieves a single historical analysis record by UUID or integer ID.
    """
    record = None
    if record_identifier.isdigit():
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.id == int(record_identifier)).first()

    if not record:
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.record_uuid == record_identifier).first()

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis record not found.")

    return record


@router.get("/records/{record_identifier}/report", response_class=HTMLResponse)
def get_record_report_html(record_identifier: str, db: Session = Depends(get_db)):
    """
    Generates a clean, academic/professional print-ready HTML/PDF report
    reproducing the exact verified historical analysis.
    """
    record = None
    if record_identifier.isdigit():
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.id == int(record_identifier)).first()

    if not record:
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.record_uuid == record_identifier).first()

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis record not found.")

    # Parse JSON fields safely
    cnn_dict = {}
    try:
        if record.cnn_predictions_json:
            cnn_dict = json.loads(record.cnn_predictions_json)
    except Exception:
        pass

    spikes_dict = {}
    try:
        if record.spike_counts_json:
            spikes_raw = json.loads(record.spike_counts_json)
            if isinstance(spikes_raw, list) and len(spikes_raw) == 3:
                spikes_dict = {"High": spikes_raw[0], "Low": spikes_raw[1], "Moderate": spikes_raw[2]}
            elif isinstance(spikes_raw, dict):
                spikes_dict = spikes_raw
    except Exception:
        pass

    recs_list = []
    try:
        if record.recommendations_json:
            recs_list = json.loads(record.recommendations_json)
            if not isinstance(recs_list, list):
                recs_list = [str(recs_list)]
    except Exception:
        pass

    # Extract top CNN class
    top_cnn_class = "Unknown"
    top_cnn_pct = 0.0
    if cnn_dict:
        top_key = max(cnn_dict, key=cnn_dict.get)
        top_cnn_class = top_key.replace("_", " ").title()
        top_cnn_pct = float(cnn_dict[top_key])

    created_str = record.created_at.strftime("%B %d, %Y at %H:%M UTC") if record.created_at else "Recent"

    cnn_rows_html = "".join([
        f"<tr><td style='padding:6px 10px; border-bottom:1px solid #e5e7eb;'>{k.replace('_', ' ').title()}</td>"
        f"<td style='padding:6px 10px; border-bottom:1px solid #e5e7eb; font-weight:700; text-align:right;'>{v:.1f}%</td></tr>"
        for k, v in cnn_dict.items()
    ])

    recs_html = "".join([
        f"<li style='margin-bottom:8px; line-height:1.45; color:#1f2937;'>{r}</li>"
        for r in recs_list
    ]) or "<li>Maintain scheduled irrigation and routine crop scouting.</li>"

    # Parse Weather Snapshot safely
    weather_dict = {}
    try:
        if getattr(record, "weather_context_json", None):
            weather_dict = json.loads(record.weather_context_json)
    except Exception:
        pass

    field_display = getattr(record, "field_name", "Field A — North Parcel") or "Field A — North Parcel"
    weather_source_display = getattr(record, "weather_source", "OpenWeather") or "OpenWeather"
    
    weather_block_html = ""
    if weather_dict:
        w_curr = weather_dict.get("current", {})
        w_fore = weather_dict.get("forecast", {})
        w_air = weather_dict.get("air_quality", {})
        w_loc = weather_dict.get("location", {})
        
        weather_block_html = f"""
  <!-- Weather Context Section -->
  <div class="section">
    <div class="section-title">4. Macroclimate &amp; Weather Context ({weather_source_display})</div>
    <div class="grid-2">
      <div class="meta-box">
        <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Observed Macro Conditions</div>
        <div style="margin-top:4px;"><strong>Weather Station:</strong> {w_loc.get('name', 'Local Grid')}, {w_loc.get('country', 'IN')} ({w_loc.get('latitude', 0.0):.3f}°N, {w_loc.get('longitude', 0.0):.3f}°E)</div>
        <div><strong>Condition:</strong> {w_curr.get('weather_condition', 'Clear')} ({w_curr.get('weather_description', 'clear sky')})</div>
        <div><strong>Ambient Temperature:</strong> {w_curr.get('temperature_c', record.temperature):.1f} °C · <strong>Humidity:</strong> {w_curr.get('humidity_percent', record.humidity):.1f} %</div>
        <div><strong>Precipitation:</strong> {w_curr.get('rainfall_mm', record.rainfall_mm):.1f} mm observed</div>
      </div>
      <div class="meta-box">
        <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Forecast &amp; Atmospheric Context</div>
        <div style="margin-top:4px;"><strong>24h Forecast Rain:</strong> {w_fore.get('next_24h_rainfall_mm', 0.0):.1f} mm (Probability: {float(w_fore.get('rain_probability', 0.0))*100:.0f}%)</div>
        <div><strong>Forecast Summary:</strong> {w_fore.get('summary', 'Stable conditions')}</div>
        <div><strong>Air Quality:</strong> AQI {w_air.get('aqi', record.aqi):.0f} ({w_air.get('aqi_category', 'Moderate')}) · <strong>Ozone:</strong> {w_air.get('ozone', record.ozone):.3f} ppm</div>
      </div>
    </div>
    <div style="margin-top:6px; font-size:11px; color:#64748b; font-style:italic;">
      * Note: Weather context was retrieved from OpenWeather at the time of analysis; this provides surrounding macroclimate data and does not represent an on-leaf direct physical sensor.
    </div>
  </div>
"""

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AgroVision Agricultural Stress Report — {record.record_uuid}</title>
<style>
  @page {{ size: A4 portrait; margin: 15mm; }}
  @media print {{
    body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .no-print {{ display: none !important; }}
  }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
    background: #f9fafb;
    margin: 0;
    padding: 24px;
    font-size: 13px;
    line-height: 1.5;
  }}
  .report-container {{
    max-width: 800px;
    margin: 0 auto;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 32px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
  }}
  .header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #059669;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }}
  .brand-title {{
    font-size: 20px;
    font-weight: 800;
    color: #065f46;
    margin: 0;
  }}
  .brand-sub {{
    font-size: 12px;
    color: #4b5563;
    margin: 2px 0 0;
  }}
  .badge {{
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }}
  .badge-high {{ background: #fee2e2; color: #dc2626; border: 1px solid #f87171; }}
  .badge-mod {{ background: #fef3c7; color: #d97706; border: 1px solid #fcd34d; }}
  .badge-low {{ background: #ecfdf5; color: #059669; border: 1px solid #6ee7b7; }}
  .section {{
    margin-bottom: 24px;
  }}
  .section-title {{
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #065f46;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    margin-bottom: 12px;
  }}
  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }}
  .meta-box {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }}
  .disclaimer {{
    font-size: 11px;
    color: #6b7280;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px 12px;
    margin-top: 24px;
  }}
  .action-bar {{
    margin-bottom: 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }}
  .btn {{
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
    border: none;
    text-decoration: none;
  }}
  .btn-print {{ background: #059669; color: #ffffff; }}
  .btn-back {{ background: #e5e7eb; color: #374151; }}
</style>
</head>
<body>

<div class="action-bar no-print" style="max-width:800px; margin:0 auto 16px;">
  <a href="/agrovision/history.html" class="btn btn-back">← Back to History</a>
  <button onclick="window.print()" class="btn btn-print">🖨️ Print / Save as PDF</button>
</div>

<div class="report-container">
  <!-- Header -->
  <div class="header">
    <div>
      <h1 class="brand-title">AGROVISION — SMART COTTON FARMING</h1>
      <p class="brand-sub">AI-Based Cotton Plant Stress Detection &amp; Environmental Risk Assessment</p>
    </div>
    <div style="text-align:right;">
      <span class="badge badge-{record.stress_severity.lower()[:3]}">{record.stress_severity} Environmental Risk</span>
      <div style="font-size:11px; color:#6b7280; margin-top:4px;">UUID: {record.record_uuid}</div>
    </div>
  </div>

  <!-- Meta Info -->
  <div class="grid-2 section">
    <div class="meta-box">
      <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Observation Metadata</div>
      <div style="margin-top:4px;"><strong>Analysis Date:</strong> {created_str}</div>
      <div><strong>Field / Parcel:</strong> {field_display}</div>
      <div><strong>Crop Growth Stage:</strong> {record.growth_stage}</div>
      <div><strong>Weather Source:</strong> {weather_source_display}</div>
    </div>
    <div class="meta-box">
      <div style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Evidence Concordance</div>
      <div style="margin-top:4px;"><strong>Visual Finding:</strong> {top_cnn_class} ({top_cnn_pct:.1f}%)</div>
      <div><strong>Environmental Risk:</strong> {record.stress_severity} ({record.confidence_score:.1f}% activity score)</div>
      <div><strong>Veto Rule Engine:</strong> Deterministic Evaluation Complete</div>
    </div>
  </div>

  <!-- Primary Findings -->
  <div class="grid-2 section">
    <div>
      <div class="section-title">1. CNN Visual Analysis</div>
      <table>
        <thead>
          <tr style="background:#f8fafc;"><th style="padding:6px 10px; text-align:left; border-bottom:1px solid #cbd5e1;">Class</th><th style="padding:6px 10px; text-align:right; border-bottom:1px solid #cbd5e1;">Probability</th></tr>
        </thead>
        <tbody>
          {cnn_rows_html}
        </tbody>
      </table>
      <div style="margin-top:8px; font-size:11px; color:#64748b;">
        Benchmarked CNN Test Accuracy: <strong>86.05%</strong> (thesis evaluation)
      </div>
    </div>

    <div>
      <div class="section-title">2. Environmental Inputs Used (SNN)</div>
      <table>
        <tbody>
          <tr><td style="padding:4px 0; color:#4b5563;">Air Temperature:</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.temperature:.1f} °C</td></tr>
          <tr><td style="padding:4px 0; color:#4b5563;">Relative Humidity:</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.humidity:.1f} %</td></tr>
          <tr><td style="padding:4px 0; color:#4b5563;">Observed Rainfall:</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.rainfall_mm:.1f} mm</td></tr>
          <tr><td style="padding:4px 0; color:#4b5563;">Soil Moisture:</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.soil_moisture:.3f} m³/m³ (Manual)</td></tr>
          <tr><td style="padding:4px 0; color:#4b5563;">Air Quality Index (AQI):</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.aqi:.0f}</td></tr>
          <tr><td style="padding:4px 0; color:#4b5563;">Tropospheric Ozone:</td><td style="padding:4px 0; font-weight:600; text-align:right;">{record.ozone:.3f} ppm</td></tr>
        </tbody>
      </table>
      <div style="margin-top:8px; font-size:11px; color:#64748b;">
        Benchmarked SNN Test Accuracy: <strong>91.81%</strong> (T=10 timesteps)
      </div>
    </div>
  </div>

  <!-- Expert Veto Precautions -->
  <div class="section">
    <div class="section-title">3. Deterministic Expert Rules &amp; Recommended Precautions</div>
    <ul style="padding-left:18px; margin:0;">
      {recs_html}
    </ul>
  </div>

  {weather_block_html}

  <!-- Disclaimer -->
  <div class="disclaimer">
    <strong>Decision Support Advisory &amp; Limitations:</strong><br>
    This report provides automated artificial intelligence screening and rule-based decision support. Thresholds and precautions are illustrative and require local agronomic validation. This assessment should not replace on-site agricultural extension diagnosis or certified crop advisory.
  </div>
</div>

</body>
</html>
"""
    return HTMLResponse(content=html_content)


@router.delete("/records/{record_identifier}")
def delete_record(record_identifier: str, db: Session = Depends(get_db)):
    """
    Deletes an analysis record by ID or UUID.
    """
    record = None
    if record_identifier.isdigit():
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.id == int(record_identifier)).first()

    if not record:
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.record_uuid == record_identifier).first()

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis record not found.")

    db.delete(record)
    db.commit()
    return {"message": f"Record {record_identifier} deleted successfully."}
