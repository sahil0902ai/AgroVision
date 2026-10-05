"""
AgroVision Combined Analysis API Router.

Exposes endpoints for:
1. POST /api/analysis/combine: Merges pre-calculated CNN & SNN evidence into a fused assessment with Expert Veto.
2. POST /api/analysis/full: End-to-end multi-modal analysis in a single request.
"""

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.db_models import AnalysisRecordDB
from ..schemas.fusion_schema import CombineAnalysisRequest, CombinedAnalysisResponse
from ..services.ai_pipeline import AIPipelineService
from ..services.fusion_engine import MultimodalFusionEngine
from ..services.recommendations import ExpertRecommendationEngine

logger = logging.getLogger("agrovision.analysis_api")
router = APIRouter()
pipeline_service = AIPipelineService()


@router.post("/analysis/combine", response_model=CombinedAnalysisResponse)
def combine_multimodal_analysis(
    payload: CombineAnalysisRequest,
    db: Session = Depends(get_db)
):
    """
    Combines independent CNN visual evidence and SNN environmental evidence
    via the Multimodal Fusion Layer and evaluates deterministic Expert Veto rules.
    Persists the traceable analysis session in the database.
    """
    try:
        visual_data = {
            "class": payload.visual_evidence.predicted_class,
            "confidence": payload.visual_evidence.confidence,
            "probabilities": payload.visual_evidence.probabilities,
        }

        # Normalize probabilities for rule evaluation
        cnn_probs_norm = {}
        for k, v in payload.visual_evidence.probabilities.items():
            clean_k = k.lower().replace(" ", "_")
            # Convert 0.0-1.0 to 0-100% if needed
            cnn_probs_norm[clean_k] = float(v) * 100.0 if float(v) <= 1.0 else float(v)

        snn_data = {
            "severity": payload.environmental_evidence.severity,
            "confidence": payload.environmental_evidence.confidence,
            "spike_counts": payload.environmental_evidence.spike_counts,
            "timesteps": payload.environmental_evidence.timesteps,
        }

        # 1. Multimodal Evidence Fusion
        fused = MultimodalFusionEngine.fuse(
            cnn_result=visual_data,
            snn_result=snn_data,
            env_inputs=payload.environmental_inputs,
        )

        # 2. Expert Veto Rule Evaluation
        veto_result = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs=cnn_probs_norm,
            snn_severity=payload.environmental_evidence.severity,
            env_data=payload.environmental_inputs,
            fusion_relationship=fused.relationship.value,
        )

        # 3. Persist record to database for history and PDF report traceability
        rec_uuid = f"AV-{uuid.uuid4().hex[:12].upper()}"
        try:
            env_in = payload.environmental_inputs
            db_record = AnalysisRecordDB(
                record_uuid=rec_uuid,
                image_url="/static/images/cotton_leaf_sample.jpg",
                temperature=float(env_in.get("temperature", 31.0)),
                humidity=float(env_in.get("humidity", 72.0)),
                soil_moisture=float(env_in.get("soil_moisture", 0.42)),
                rainfall_mm=float(env_in.get("rainfall", env_in.get("rainfall_mm", 18.0))),
                aqi=float(env_in.get("aqi", 84.0)),
                ozone=float(env_in.get("ozone", 0.041)),
                growth_stage=str(env_in.get("growth_stage", "Flowering")),
                stress_severity=payload.environmental_evidence.severity,
                confidence_score=payload.environmental_evidence.confidence * 100.0 if payload.environmental_evidence.confidence <= 1.0 else payload.environmental_evidence.confidence,
                cnn_predictions_json=json.dumps(cnn_probs_norm),
                spike_counts_json=json.dumps(payload.environmental_evidence.spike_counts),
                fusion_json=json.dumps({
                    "relationship": fused.relationship.value,
                    "alignment_score": fused.alignment_score,
                    "summary": fused.summary,
                    "interpretation": fused.interpretation,
                    "visual_lead_evidence": fused.visual_lead_evidence,
                    "environmental_lead_evidence": fused.environmental_lead_evidence,
                }),
                expert_veto_json=json.dumps(veto_result),
                recommendations_json=json.dumps(veto_result["final_assessment"]["precautions"]),
            )
            db.add(db_record)
            db.commit()
        except Exception as dbe:
            logger.warning(f"Could not persist combined record: {dbe}")
            db.rollback()

        return CombinedAnalysisResponse(
            record_uuid=rec_uuid,
            visual_assessment=visual_data,
            environmental_assessment=snn_data,
            environmental_inputs=payload.environmental_inputs,
            fusion={
                "relationship": fused.relationship.value,
                "alignment_score": fused.alignment_score,
                "summary": fused.summary,
                "interpretation": fused.interpretation,
                "visual_lead_evidence": fused.visual_lead_evidence,
                "environmental_lead_evidence": fused.environmental_lead_evidence,
            },
            expert_veto={
                "overall_status": veto_result["overall_status"],
                "rule_count": veto_result["rule_count"],
                "triggered_rules": veto_result["triggered_rules"],
            },
            final_assessment=veto_result["final_assessment"],
        )

    except Exception as e:
        logger.exception(f"Error executing combined analysis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Combined analysis could not be completed: {str(e)}",
        )


@router.post("/analysis/full", response_model=CombinedAnalysisResponse)
async def full_multimodal_analysis(
    file: UploadFile = File(...),
    temperature: float = Form(...),
    humidity: float = Form(...),
    soil_moisture: float = Form(...),
    rainfall_mm: float = Form(0.0),
    aqi: float = Form(50.0),
    ozone: float = Form(0.035),
    growth_stage: str = Form("Flowering"),
    db: Session = Depends(get_db),
):
    """
    Executes full end-to-end pipeline in a single session:
    1. CNN visual inference on uploaded leaf image.
    2. SNN spiking inference across 33 environmental inputs.
    3. Multimodal fusion and evidentiary alignment.
    4. Deterministic Expert Veto rules.
    5. Database history persistence with full traceability.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image (JPG/PNG).")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image file is empty.")

    env_data = {
        "temperature": temperature,
        "humidity": humidity,
        "soil_moisture": soil_moisture,
        "rainfall_mm": rainfall_mm,
        "aqi": aqi,
        "ozone": ozone,
        "growth_stage": growth_stage,
    }

    try:
        pipeline_res = pipeline_service.process_prediction(image_bytes, env_data)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except RuntimeError as re_:
        raise HTTPException(status_code=503, detail=str(re_))

    cnn_percents = pipeline_res["cnn_predictions"]
    # Reconstruct 0.0-1.0 probabilities for response
    cnn_probs = {k: v / 100.0 for k, v in cnn_percents.items()}
    # Find top class
    top_class_key = max(cnn_percents, key=cnn_percents.get)
    key_to_name = {
        "healthy": "Healthy",
        "water_stress": "Water Stress",
        "heat_stress": "Heat Stress",
        "nutrient_deficiency": "Nutrient Deficiency",
        "pollution": "Pollution",
    }
    top_visual_class = key_to_name.get(top_class_key, "Unknown")
    top_visual_conf = cnn_probs.get(top_class_key, 0.0)

    visual_data = {
        "class": top_visual_class,
        "confidence": top_visual_conf,
        "probabilities": cnn_probs,
    }

    snn_info = pipeline_res["snn_result"]
    snn_data = {
        "severity": snn_info["severity"],
        "confidence": snn_info["confidence_percent"] / 100.0,
        "spike_counts": snn_info["spike_counts"],
        "timesteps": snn_info["timesteps"],
    }

    # 1. Multimodal Evidence Fusion
    fused = MultimodalFusionEngine.fuse(
        cnn_result=visual_data,
        snn_result=snn_data,
        env_inputs=env_data,
    )

    # 2. Expert Veto Rule Evaluation
    veto_result = ExpertRecommendationEngine.evaluate_structured(
        cnn_probs=cnn_percents,
        snn_severity=snn_info["severity"],
        env_data=env_data,
        fusion_relationship=fused.relationship.value,
    )

    # Persist in DB
    try:
        db_record = AnalysisRecordDB(
            record_uuid=pipeline_res["record_uuid"],
            image_url=pipeline_res["image_url"],
            heatmap_url=pipeline_res.get("heatmap_url"),
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture,
            rainfall_mm=rainfall_mm,
            aqi=aqi,
            ozone=ozone,
            growth_stage=growth_stage,
            stress_severity=snn_info["severity"],
            confidence_score=snn_info["confidence_percent"],
            cnn_predictions_json=json.dumps(cnn_percents),
            spike_counts_json=json.dumps(snn_info["spike_counts"]),
            recommendations_json=json.dumps(veto_result["final_assessment"]["precautions"]),
        )
        db.add(db_record)
        db.commit()
    except Exception as dbe:
        logger.warning(f"Could not persist record to database: {dbe}")

    return CombinedAnalysisResponse(
        record_uuid=pipeline_res["record_uuid"],
        visual_assessment=visual_data,
        environmental_assessment=snn_data,
        environmental_inputs=env_data,
        fusion={
            "relationship": fused.relationship.value,
            "alignment_score": fused.alignment_score,
            "summary": fused.summary,
            "interpretation": fused.interpretation,
            "visual_lead_evidence": fused.visual_lead_evidence,
            "environmental_lead_evidence": fused.environmental_lead_evidence,
        },
        expert_veto={
            "overall_status": veto_result["overall_status"],
            "rule_count": veto_result["rule_count"],
            "triggered_rules": veto_result["triggered_rules"],
        },
        final_assessment=veto_result["final_assessment"],
    )
