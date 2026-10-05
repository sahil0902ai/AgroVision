import json

from app.core.config import settings
from app.core.database import get_db
from app.models.db_models import AnalysisRecordDB
from app.models.schemas import PredictResponseSchema
from app.services.ai_pipeline import AIPipelineService
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

router = APIRouter()
pipeline_service = AIPipelineService()

@router.post("/predict", response_model=PredictResponseSchema)
async def predict_cotton_stress(
    file: UploadFile = File(...),
    temperature: float = Form(31.0),
    humidity: float = Form(72.0),
    soil_moisture: float = Form(0.42),
    rainfall_mm: float = Form(18.0),
    aqi: float = Form(84.0),
    ozone: float = Form(0.041),
    growth_stage: str = Form("Flowering"),
    db: Session = Depends(get_db)
):
    """
    Analyzes a cotton leaf image with the AgroVision CNN, processes
    environmental parameters with the trained AgroVision SNN, generates a
    Grad-CAM heatmap, and returns agronomic advice derived from the actual
    model outputs.

    Environmental values use the SNN training-native units:
    soil_moisture is volumetric (m³/m³, e.g. 0.42) and ozone is on the
    training-native scale (e.g. 0.041). Values outside the accepted ranges
    are rejected with the valid range in the message.
    """
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image size is too large (max {settings.MAX_UPLOAD_SIZE_MB}MB)."
        )

    env_data = {
        "temperature": temperature,
        "humidity": humidity,
        "soil_moisture": soil_moisture,
        "rainfall_mm": rainfall_mm,
        "aqi": aqi,
        "ozone": ozone,
        "growth_stage": growth_stage
    }

    try:
        result = pipeline_service.process_prediction(image_bytes, env_data, upload_dir="uploads")
    except ValueError as ve:
        # Missing/invalid environmental inputs or unreadable image
        raise HTTPException(status_code=422, detail=str(ve))
    except RuntimeError as re_:
        # Model unavailable (weights not loaded)
        raise HTTPException(status_code=503, detail=str(re_))

    # Persist in DB
    db_record = AnalysisRecordDB(
        record_uuid=result["record_uuid"],
        image_url=result["image_url"],
        heatmap_url=result["heatmap_url"],
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        rainfall_mm=rainfall_mm,
        aqi=aqi,
        ozone=ozone,
        growth_stage=growth_stage,
        stress_severity=result["snn_result"]["severity"],
        confidence_score=result["snn_result"]["confidence_percent"],
        cnn_predictions_json=json.dumps(result["cnn_predictions"]),
        spike_counts_json=json.dumps(result["snn_result"]["spike_counts"]),
        recommendations_json=json.dumps(result["recommendations"])
    )
    db.add(db_record)
    db.commit()
    db.refresh(db_record)

    return result
