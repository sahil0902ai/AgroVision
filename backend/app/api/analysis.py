"""
AgroVision Combined Analysis API Router.

Exposes endpoints for:
1. POST /api/analysis: Full 9-step unified ML inference pipeline (CNN + SNN + Fusion + Expert Veto + Persistence).
2. POST /api/analysis/combine: Merges pre-calculated CNN & SNN evidence into a fused assessment with Expert Veto.
3. POST /api/analysis/full: Backward-compatible multi-modal analysis endpoint.
"""

import json
import logging
import os
import time
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.db_models import AnalysisRecordDB, NotificationDB
from ..schemas.fusion_schema import (
    CNNAnalysisOutput,
    CombineAnalysisRequest,
    CombinedAnalysisResponse,
    EnvironmentAnalysisOutput,
    ExpertVetoAnalysisOutput,
    FinalAssessmentOutput,
    FusionAnalysisOutput,
    MetadataOutput,
    SNNAnalysisOutput,
    TriggeredRule,
    UnifiedAnalysisResponse,
)
from ..services.ai_pipeline import AIPipelineService
from ..services.fusion_engine import MultimodalFusionEngine
from ..services.recommendations import ExpertRecommendationEngine

logger = logging.getLogger("agrovision.analysis_api")
router = APIRouter()
pipeline_service = AIPipelineService()


@router.post("/analysis", response_model=UnifiedAnalysisResponse, tags=["Multimodal Analysis & Expert Veto"])
@router.post("/analysis/run", response_model=UnifiedAnalysisResponse, tags=["Multimodal Analysis & Expert Veto"])
async def run_unified_analysis(
    file: UploadFile = File(..., description="Uploaded cotton leaf image (JPG, PNG, WEBP)"),
    temperature: float = Form(..., description="Ambient air temperature in °C"),
    humidity: float = Form(..., description="Relative humidity in %"),
    soil_moisture: float = Form(..., description="Soil moisture ratio (0-1) or percentage (0-100)"),
    rainfall_mm: float = Form(0.0, description="Observed or recent rainfall in mm"),
    aqi: float = Form(50.0, description="Air Quality Index"),
    ozone: float = Form(0.035, description="Tropospheric ozone concentration in ppm or ppb"),
    growth_stage: str = Form("Flowering", description="Crop growth stage: Emergence, Vegetative, Flowering, Boll Development, Maturity"),
    days_since_sowing: int = Form(60, description="Days elapsed since crop sowing"),
    field_name: str = Form("Field A — Wardha South Station", description="Monitored field or parcel identifier"),
    weather_source: str = Form("AUTO · Weather API", description="Data provenance label for climate telemetry"),
    weather_context_json: Optional[str] = Form(None, description="Optional raw JSON snapshot from OpenWeather API"),
    user_email: Optional[str] = Form(None, description="Authenticated user email for scoped persistence"),
    db: Session = Depends(get_db),
):
    """
    AgroVision Real ML Backend Inference Pipeline:
    1. Validate request parameters.
    2. Validate leaf image integrity and format.
    3. Run CNN visual stress model (ResNet-18 Custom, 224x224 RGB, Grad-CAM).
    4. Run SNN environmental model (33-feature contract, T=10 LIF timesteps, beta=0.95, fixed pre-fitted scaler).
    5. Perform Multimodal Fusion (concordance matrix, 60% CNN + 40% SNN evidentiary alignment).
    6. Execute deterministic Expert Veto Engine (EVR-001 through EVR-007).
    7. Generate final structured assessment and actionable checklist.
    8. Persist verified analysis session in database.
    9. Return structured JSON with clear separation between CNN, SNN, Environment, Fusion, Expert Veto, Final Assessment, and Metadata.
    """
    total_start = time.perf_counter()

    # -------------------------------------------------------------
    # 1. Validate Request Parameters
    # -------------------------------------------------------------
    if not (-10.0 <= temperature <= 65.0):
        raise HTTPException(status_code=422, detail=f"Temperature {temperature}°C is outside valid agricultural physical bounds (-10 to 65°C).")
    if not (0.0 <= humidity <= 100.0):
        raise HTTPException(status_code=422, detail=f"Humidity {humidity}% must be between 0% and 100%.")

    # Normalize soil moisture
    sm_val = float(soil_moisture)
    if sm_val > 1.0:
        soil_moisture_ratio = sm_val / 100.0
    else:
        soil_moisture_ratio = sm_val

    # Normalize ozone
    oz_val = float(ozone)
    if oz_val > 1.0:
        ozone_ppm = oz_val / 1000.0
    else:
        ozone_ppm = oz_val

    # -------------------------------------------------------------
    # 2. Validate Image
    # -------------------------------------------------------------
    if not file.content_type or not any(file.content_type.startswith(t) for t in ["image/", "application/octet-stream"]):
        raise HTTPException(status_code=400, detail="Uploaded file must be a valid image format (JPEG, PNG, or WEBP).")

    image_bytes = await file.read()
    if not image_bytes or len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded image file contains 0 bytes.")
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file size exceeds maximum permitted limit of 10 MB.")

    cnn_engine, snn_engine, gradcam = pipeline_service._get_pipeline()

    # -------------------------------------------------------------
    # 3. Run CNN Visual Analysis (ResNet-18 Custom, 224x224 RGB, Grad-CAM)
    # -------------------------------------------------------------
    cnn_start = time.perf_counter()
    try:
        cnn_raw_result = cnn_engine.predict(image_bytes)
        img_tensor, pil_img = cnn_engine.preprocess_image(image_bytes)
        target_cls_idx = cnn_raw_result["predicted_class_index"]
        heatmap_np = gradcam.generate_heatmap(img_tensor, target_class_idx=target_cls_idx)
        from ..services.gradcam import overlay_heatmap_on_image
        overlay_pil = overlay_heatmap_on_image(pil_img, heatmap_np)
    except Exception as img_err:
        logger.error(f"CNN processing error: {img_err}", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Visual analysis unavailable: {str(img_err)}")

    cnn_latency_ms = max(0.5, (time.perf_counter() - cnn_start) * 1000.0)

    # Save leaf image and heatmap
    session_uuid = f"AV-{uuid.uuid4().hex[:12].upper()}"
    rec_slug = session_uuid.replace("AV-", "").lower()
    os.makedirs("uploads/images", exist_ok=True)
    os.makedirs("uploads/heatmaps", exist_ok=True)
    orig_path = f"uploads/images/leaf_{rec_slug}.jpg"
    heatmap_path = f"uploads/heatmaps/gradcam_{rec_slug}.jpg"
    pil_img.save(orig_path, format="JPEG", quality=90)
    overlay_pil.save(heatmap_path, format="JPEG", quality=90)

    raw_cnn_probs = cnn_raw_result["class_probabilities"]
    top_cnn_class = cnn_raw_result.get("predicted_class_label") or cnn_raw_result.get("predicted_class") or "Healthy"
    top_cnn_conf = float(cnn_raw_result.get("confidence_score") or raw_cnn_probs.get(top_cnn_class, 0.90))

    # Standardized 5-class distribution
    cnn_probs_norm = {
        "healthy": round(raw_cnn_probs.get("Healthy", 0.0) * 100, 2),
        "water_stress": round(raw_cnn_probs.get("Water Stress", 0.0) * 100, 2),
        "heat_stress": round(raw_cnn_probs.get("Heat Stress", 0.0) * 100, 2),
        "nutrient_deficiency": round(raw_cnn_probs.get("Nutrient Deficiency", 0.0) * 100, 2),
        "pollution": round(raw_cnn_probs.get("Pollution", 0.0) * 100, 2),
    }

    # -------------------------------------------------------------
    # 4. Run SNN Environmental Analysis (33-feature contract, T=10, beta=0.95)
    # -------------------------------------------------------------
    snn_start = time.perf_counter()
    env_data = {
        "temperature": temperature,
        "humidity": humidity,
        "rainfall": rainfall_mm,
        "rainfall_mm": rainfall_mm,
        "soil_moisture": soil_moisture_ratio,
        "aqi": aqi,
        "ozone": ozone_ppm,
        "growth_stage": growth_stage,
        "days_since_sowing": days_since_sowing,
    }

    try:
        snn_payload = pipeline_service.build_snn_payload(env_data)
        snn_raw_result = snn_engine.predict(snn_payload)
    except Exception as snn_err:
        logger.error(f"SNN processing error: {snn_err}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"Environmental assessment unavailable: {str(snn_err)}")

    snn_latency_ms = max(0.5, (time.perf_counter() - snn_start) * 1000.0)
    snn_predicted_severity = snn_raw_result["predicted_severity"]
    snn_conf = float(snn_raw_result["class_scores"][snn_predicted_severity])
    snn_spike_counts = snn_raw_result["spike_counts"]

    # -------------------------------------------------------------
    # 5. Perform Multimodal Fusion
    # -------------------------------------------------------------
    fusion_start = time.perf_counter()
    visual_evidence_dict = {
        "class": top_cnn_class,
        "confidence": top_cnn_conf,
        "probabilities": raw_cnn_probs,
    }
    snn_evidence_dict = {
        "severity": snn_predicted_severity,
        "confidence": snn_conf,
        "spike_counts": snn_spike_counts,
        "timesteps": snn_raw_result["timesteps"],
    }

    fused = MultimodalFusionEngine.fuse(
        cnn_result=visual_evidence_dict,
        snn_result=snn_evidence_dict,
        env_inputs=env_data,
    )
    fusion_latency_ms = max(0.2, (time.perf_counter() - fusion_start) * 1000.0)

    # -------------------------------------------------------------
    # 6. Execute Expert Veto Engine (EVR-001..007)
    # -------------------------------------------------------------
    weather_context_obj = None
    forecast_rain_val = 0.0
    if weather_context_json:
        try:
            weather_context_obj = json.loads(weather_context_json)
            if "forecast" in weather_context_obj:
                forecast_rain_val = float(weather_context_obj["forecast"].get("next_24h_rainfall_mm", 0.0))
        except Exception:
            pass

    env_eval_dict = dict(env_data)
    env_eval_dict["forecast_rainfall_mm"] = forecast_rain_val

    veto_result = ExpertRecommendationEngine.evaluate_structured(
        cnn_probs=cnn_probs_norm,
        snn_severity=snn_predicted_severity,
        env_data=env_eval_dict,
        fusion_relationship=fused.relationship.value,
    )

    triggered_rules_parsed = [
        TriggeredRule(
            rule_id=r.get("rule_id", "EVR-000"),
            name=r.get("name", "Rule"),
            severity=r.get("severity", "INFO"),
            rule_status=r.get("rule_status", "Qualified"),
            condition=r.get("condition", ""),
            reason=r.get("reason", ""),
            interpretation=r.get("interpretation", ""),
            impact=r.get("impact", ""),
            precaution=r.get("precaution", ""),
            what_to_check=r.get("what_to_check", ""),
            rationale=r.get("rationale", ""),
            threshold_status=r.get("threshold_status", "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION"),
        )
        for r in veto_result.get("triggered_rules", [])
    ]

    # -------------------------------------------------------------
    # 7. Generate Final Structured Assessment
    # -------------------------------------------------------------
    final_summary_narrative = (
        veto_result.get("final_assessment", {}).get("summary")
        or f"Visual foliar examination demonstrates {top_cnn_class} ({top_cnn_conf * 100:.1f}% confidence), qualified by {snn_predicted_severity} ambient environmental risk."
    )
    recs_list = veto_result.get("final_assessment", {}).get("precautions", [])

    # Checklist items for what to check next
    checklist_items = []
    top_low = top_cnn_class.lower()
    if "nutrient" in top_low:
        checklist_items.append("Confirm soil nutrient status (N, P, K, Zn, Mg) using laboratory test kit before foliar spray.")
        checklist_items.append("Inspect lower versus upper canopy leaves to differentiate mobile nitrogen deficiency from trace chlorosis.")
    elif "water" in top_low or snn_predicted_severity == "High":
        checklist_items.append("Review root zone soil moisture at 15–30 cm depth using sensor probe or core sampler.")
        checklist_items.append("Inspect canopy turgor during early morning hours (6:00 AM – 8:00 AM) to verify recovery.")
    elif "heat" in top_low:
        checklist_items.append("Monitor afternoon canopy temperatures and square retention rates during peak solar heat.")
        checklist_items.append("Inspect top terminal leaves for marginal scorching or upward cupping.")
    else:
        checklist_items.append("Confirm root zone moisture levels remain within optimal 55%–75% capacity.")
        checklist_items.append("Inspect upper and lower leaf surfaces for sucking pest infestation or subtle discoloration.")

    checklist_items.append("Review recent rainfall and 48-hour precipitation forecast before executing scheduled irrigation.")
    checklist_items.append("Repeat AgroVision multimodal analysis in 3 to 7 days to track field health progression.")

    total_latency_ms = (time.perf_counter() - total_start) * 1000.0

    # -------------------------------------------------------------
    # 8. Save Analysis to Database
    # -------------------------------------------------------------
    clean_email = user_email.strip().lower() if user_email and user_email.strip() else None
    try:
        db_record = AnalysisRecordDB(
            record_uuid=session_uuid,
            user_email=clean_email,
            field_name=field_name,
            image_url=f"/{orig_path}",
            heatmap_url=f"/{heatmap_path}",
            temperature=temperature,
            humidity=humidity,
            soil_moisture=soil_moisture_ratio,
            rainfall_mm=rainfall_mm,
            forecast_rainfall_mm=forecast_rain_val,
            aqi=aqi,
            ozone=ozone_ppm,
            growth_stage=growth_stage,
            stress_severity=snn_predicted_severity,
            confidence_score=snn_conf * 100.0 if snn_conf <= 1.0 else snn_conf,
            cnn_predictions_json=json.dumps(cnn_probs_norm),
            spike_counts_json=json.dumps(snn_spike_counts),
            fusion_json=json.dumps({
                "relationship": fused.relationship.value,
                "alignment_score": fused.alignment_score,
                "summary": fused.summary,
                "interpretation": fused.interpretation,
                "visual_lead_evidence": fused.visual_lead_evidence,
                "environmental_lead_evidence": fused.environmental_lead_evidence,
            }),
            expert_veto_json=json.dumps(veto_result),
            recommendations_json=json.dumps(recs_list),
            weather_source=weather_source,
            weather_context_json=weather_context_json if weather_context_json else (json.dumps(weather_context_obj) if weather_context_obj else None),
            created_at=datetime.utcnow(),
        )
        db.add(db_record)
        
        # Create real-time notification
        is_alert = bool(veto_result.get("triggered_rules"))
        notif = NotificationDB(
            user_email=clean_email or "default_farmer@agrovision.org",
            title=f"Expert Precaution: {top_cnn_class}" if is_alert else f"Analysis Saved: {top_cnn_class}",
            message=f"Session {session_uuid[:8]} completed for {field_name}. Visual: {top_cnn_class}, Environmental: {snn_predicted_severity}.",
            notif_type="expert_veto" if is_alert else "analysis",
            link_url=f"analysis_detail.html?uuid={session_uuid}",
            is_read=0,
            created_at=datetime.utcnow()
        )
        db.add(notif)
        db.commit()
    except Exception as dbe:
        logger.error(f"Database persistence error: {dbe}", exc_info=True)
        db.rollback()

    # -------------------------------------------------------------
    # 9. Return Structured JSON Response
    # -------------------------------------------------------------
    return UnifiedAnalysisResponse(
        success=True,
        record_uuid=session_uuid,
        cnn=CNNAnalysisOutput(
            predicted_class=top_cnn_class,
            confidence=top_cnn_conf,
            confidence_percentage=round(top_cnn_conf * 100.0, 2),
            probabilities=raw_cnn_probs,
            image_url=f"/{orig_path}",
            heatmap_url=f"/{heatmap_path}",
            inference_time_ms=round(cnn_latency_ms, 2),
            architecture="ResNet-18 Custom",
            input_resolution="224x224 RGB",
            provenance="CNN MODEL",
        ),
        snn=SNNAnalysisOutput(
            predicted_severity=snn_predicted_severity,
            confidence=snn_conf,
            confidence_percentage=round(snn_conf * 100.0, 2),
            spike_counts=snn_spike_counts,
            timesteps=snn_raw_result["timesteps"],
            membrane_decay_beta=0.95,
            feature_count=33,
            inference_time_ms=round(snn_latency_ms, 2),
            provenance="SNN MODEL",
        ),
        environment=EnvironmentAnalysisOutput(
            temperature=temperature,
            humidity=humidity,
            rainfall=rainfall_mm,
            soil_moisture=soil_moisture_ratio,
            aqi=aqi,
            ozone=ozone_ppm,
            growth_stage=growth_stage,
            days_since_sowing=days_since_sowing,
            weather_source=weather_source,
            weather_context=weather_context_obj,
            provenance="AUTO · Weather API" if "AUTO" in weather_source.upper() else "MANUAL INPUT",
        ),
        fusion=FusionAnalysisOutput(
            relationship=fused.relationship.value,
            alignment_score=fused.alignment_score,
            summary=fused.summary,
            interpretation=fused.interpretation,
            visual_lead_evidence=fused.visual_lead_evidence,
            environmental_lead_evidence=fused.environmental_lead_evidence,
            provenance="FUSION ENGINE",
        ),
        expert_veto=ExpertVetoAnalysisOutput(
            overall_status=veto_result.get("overall_status", "PASSED"),
            rule_count=veto_result.get("rule_count", 7),
            triggered_rules=triggered_rules_parsed,
            provenance="RULE ENGINE",
        ),
        final_assessment=FinalAssessmentOutput(
            diagnosis=top_cnn_class,
            environmental_risk=snn_predicted_severity,
            relationship=fused.relationship.value,
            summary=final_summary_narrative,
            requires_immediate_action=veto_result.get("final_assessment", {}).get("requires_immediate_action", False),
            recommendations=recs_list,
            what_to_check_next=checklist_items,
            provenance="FINAL SYNTHESIS",
        ),
        metadata=MetadataOutput(
            record_uuid=session_uuid,
            user_email=clean_email,
            field_name=field_name,
            timestamp=datetime.utcnow(),
            data_provenance={
                "image": "FARMER UPLOAD",
                "weather": weather_source,
                "soil_moisture": "MANUAL INPUT",
                "field_profile": "FIELD PROFILE",
                "visual_analysis": "CNN MODEL",
                "climate_analysis": "SNN MODEL",
                "safety_rules": "RULE ENGINE",
                "storage": "DATABASE",
            },
            latencies={
                "cnn_ms": round(cnn_latency_ms, 2),
                "snn_ms": round(snn_latency_ms, 2),
                "fusion_ms": round(fusion_latency_ms, 2),
                "total_ms": round(total_latency_ms, 2),
            },
        ),
    )


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
        env_with_forecast = dict(payload.environmental_inputs)
        forecast_rain_val = 0.0
        if payload.weather_context and "forecast" in payload.weather_context:
            forecast_rain_val = float(payload.weather_context["forecast"].get("next_24h_rainfall_mm", 0.0))
            env_with_forecast["forecast_rainfall_mm"] = forecast_rain_val

        veto_result = ExpertRecommendationEngine.evaluate_structured(
            cnn_probs=cnn_probs_norm,
            snn_severity=payload.environmental_evidence.severity,
            env_data=env_with_forecast,
            fusion_relationship=fused.relationship.value,
        )

        # 3. Persist record to database for history and PDF report traceability
        rec_uuid = f"AV-{uuid.uuid4().hex[:12].upper()}"
        field_id_name = payload.field_name or "Field A — North Parcel"
        weather_json_str = json.dumps(payload.weather_context) if payload.weather_context else None

        try:
            env_in = payload.environmental_inputs or {}
            clean_email = payload.user_email.strip().lower() if payload.user_email else None
            db_record = AnalysisRecordDB(
                record_uuid=rec_uuid,
                user_email=clean_email,
                field_name=field_id_name,
                image_url="",
                temperature=float(env_in.get("temperature", 0.0)),
                humidity=float(env_in.get("humidity", 0.0)),
                soil_moisture=float(env_in.get("soil_moisture", 0.0)),
                rainfall_mm=float(env_in.get("rainfall", env_in.get("rainfall_mm", 0.0))),
                forecast_rainfall_mm=forecast_rain_val,
                aqi=float(env_in.get("aqi", 0.0)),
                ozone=float(env_in.get("ozone", 0.0)),
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
                weather_source="OpenWeather" if payload.weather_context else "Manual",
                weather_context_json=weather_json_str,
                created_at=datetime.utcnow(),
            )
            db.add(db_record)
            
            is_alert = bool(veto_result.get("triggered_rules"))
            vis_class = payload.visual_evidence.predicted_class
            notif = NotificationDB(
                user_email=clean_email or "default_farmer@agrovision.org",
                title=f"Expert Precaution: {vis_class}" if is_alert else f"Analysis Saved: {vis_class}",
                message=f"Session {rec_uuid[:8]} completed for {field_id_name}. Visual: {vis_class}, Environmental: {payload.environmental_evidence.severity}.",
                notif_type="expert_veto" if is_alert else "analysis",
                link_url=f"analysis_detail.html?uuid={rec_uuid}",
                is_read=0,
                created_at=datetime.utcnow()
            )
            db.add(notif)
            db.commit()
        except Exception as dbe:
            logger.warning(f"Could not persist combined record: {dbe}")
            db.rollback()

        triggered_rules_parsed = [
            TriggeredRule(
                rule_id=r.get("rule_id", "EVR-000"),
                name=r.get("name", "Rule"),
                severity=r.get("severity", "INFO"),
                rule_status=r.get("rule_status", "Qualified"),
                condition=r.get("condition", ""),
                reason=r.get("reason", ""),
                interpretation=r.get("interpretation", ""),
                impact=r.get("impact", ""),
                precaution=r.get("precaution", ""),
                what_to_check=r.get("what_to_check", ""),
                rationale=r.get("rationale", ""),
                threshold_status=r.get("threshold_status", "ILLUSTRATIVE / REQUIRES AGRONOMIC VALIDATION"),
            )
            for r in veto_result.get("triggered_rules", [])
        ]

        return CombinedAnalysisResponse(
            record_uuid=rec_uuid,
            field_name=field_id_name,
            visual_assessment=visual_data,
            environmental_assessment=snn_data,
            environmental_inputs=payload.environmental_inputs,
            weather_context=payload.weather_context,
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
                "triggered_rules": triggered_rules_parsed,
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
    field_name: str = Form("Field A — North Parcel"),
    user_email: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Executes full end-to-end pipeline in a single session.
    """
    res = await run_unified_analysis(
        file=file,
        temperature=temperature,
        humidity=humidity,
        soil_moisture=soil_moisture,
        rainfall_mm=rainfall_mm,
        aqi=aqi,
        ozone=ozone,
        growth_stage=growth_stage,
        field_name=field_name,
        user_email=user_email,
        db=db,
    )
    return CombinedAnalysisResponse(
        record_uuid=res.record_uuid,
        visual_assessment={
            "class": res.cnn.predicted_class,
            "confidence": res.cnn.confidence,
            "probabilities": res.cnn.probabilities,
        },
        environmental_assessment={
            "severity": res.snn.predicted_severity,
            "confidence": res.snn.confidence,
            "spike_counts": res.snn.spike_counts,
            "timesteps": res.snn.timesteps,
        },
        environmental_inputs={
            "temperature": res.environment.temperature,
            "humidity": res.environment.humidity,
            "soil_moisture": res.environment.soil_moisture,
            "rainfall": res.environment.rainfall,
            "aqi": res.environment.aqi,
            "ozone": res.environment.ozone,
            "growth_stage": res.environment.growth_stage,
        },
        fusion={
            "relationship": res.fusion.relationship,
            "alignment_score": res.fusion.alignment_score,
            "summary": res.fusion.summary,
            "interpretation": res.fusion.interpretation,
            "visual_lead_evidence": res.fusion.visual_lead_evidence,
            "environmental_lead_evidence": res.fusion.environmental_lead_evidence,
        },
        expert_veto={
            "overall_status": res.expert_veto.overall_status,
            "rule_count": res.expert_veto.rule_count,
            "triggered_rules": res.expert_veto.triggered_rules,
        },
        final_assessment={
            "summary": res.final_assessment.summary,
            "overall_status": res.expert_veto.overall_status,
            "precautions": res.final_assessment.recommendations,
            "requires_immediate_action": res.final_assessment.requires_immediate_action,
        },
    )

