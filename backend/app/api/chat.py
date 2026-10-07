import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.db_models import AnalysisRecordDB, ChatMessageDB
from ..schemas.chat_schema import ChatMessageItem, ChatRequest, ChatResponse
from ..services.gemini_service import GeminiChatService
from ..services.weather_service import WeatherService

logger = logging.getLogger("agrovision.chat_api")
router = APIRouter()


@router.post("/chat", response_model=ChatResponse, tags=["AI Assistant (Gemini)"])
def chat_with_assistant(
    payload: ChatRequest,
    db: Session = Depends(get_db)
):
    """
    Interacts with the official Google Gemini AI Assistant grounded in verified
    analysis context, OpenWeather observations/forecasts, and deterministic Expert Veto rules.
    """
    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    if len(user_message) > 2000:
        raise HTTPException(status_code=400, detail="Message exceeds maximum allowed length of 2000 characters.")

    gemini_service = GeminiChatService.get_instance()
    weather_service = WeatherService.get_instance()

    analysis_data: Optional[Dict[str, Any]] = None
    weather_data: Optional[Dict[str, Any]] = None
    field_name = payload.field_name or "Field A — North Parcel"

    # 1. Check if anchored to a saved database record
    if payload.record_uuid:
        record = db.query(AnalysisRecordDB).filter(AnalysisRecordDB.record_uuid == payload.record_uuid).first()
        if record:
            field_name = record.field_name or field_name
            # Reconstruct analysis dictionary from DB record
            cnn_probs = {}
            try:
                if record.cnn_predictions_json:
                    cnn_probs = json.loads(record.cnn_predictions_json)
            except Exception:
                pass

            top_class = "Healthy"
            top_pct = 0.0
            if cnn_probs:
                top_key = max(cnn_probs, key=cnn_probs.get)
                top_class = top_key.replace("_", " ").title()
                top_pct = float(cnn_probs[top_key])

            spikes = {}
            try:
                if record.spike_counts_json:
                    spikes = json.loads(record.spike_counts_json)
            except Exception:
                pass

            fusion_dict = {}
            try:
                if record.fusion_json:
                    fusion_dict = json.loads(record.fusion_json)
            except Exception:
                pass

            veto_dict = {}
            try:
                if record.expert_veto_json:
                    veto_dict = json.loads(record.expert_veto_json)
            except Exception:
                pass

            recs = []
            try:
                if record.recommendations_json:
                    recs = json.loads(record.recommendations_json)
            except Exception:
                pass

            analysis_data = {
                "record_uuid": record.record_uuid,
                "growth_stage": record.growth_stage,
                "visual_assessment": {
                    "class": top_class,
                    "confidence": top_pct / 100.0 if top_pct > 1.0 else top_pct,
                    "probabilities": cnn_probs,
                },
                "environmental_assessment": {
                    "severity": record.stress_severity,
                    "confidence": record.confidence_score / 100.0 if record.confidence_score > 1.0 else record.confidence_score,
                    "spike_counts": spikes,
                },
                "environmental_inputs": {
                    "temperature": record.temperature,
                    "humidity": record.humidity,
                    "rainfall": record.rainfall_mm,
                    "soil_moisture": record.soil_moisture,
                    "aqi": record.aqi,
                    "ozone": record.ozone,
                },
                "fusion": fusion_dict,
                "expert_veto": veto_dict,
                "final_assessment": {
                    "description": fusion_dict.get("summary", "Evaluated Multimodal Assessment"),
                    "precautions": recs,
                },
            }

            # Use saved historical weather snapshot if available
            if record.weather_context_json:
                try:
                    weather_data = json.loads(record.weather_context_json)
                except Exception:
                    pass

    # 2. Check if in-memory session context was passed directly from the active dashboard
    elif payload.session_context:
        analysis_data = payload.session_context
        if "weather_context" in payload.session_context:
            weather_data = payload.session_context["weather_context"]

    # 3. If no weather snapshot exists yet, fetch current weather for the field
    if not weather_data:
        try:
            # Map field coordinates
            field_obj = weather_service.get_field_by_id(field_name)
            lat = field_obj.latitude if field_obj else 20.9750
            lon = field_obj.longitude if field_obj else 78.7200
            weather_resp = weather_service.get_weather(lat, lon)
            weather_data = weather_resp.model_dump()
        except Exception as we:
            logger.warning(f"Could not load live weather context for chat: {we}")

    # 4. Convert history items to dictionary list
    history_list = [h.model_dump() for h in (payload.history or [])]

    # 5. Call Gemini Chat Service
    chat_result = gemini_service.chat(
        message=user_message,
        analysis_data=analysis_data,
        weather_data=weather_data,
        field_name=field_name,
        history=history_list,
    )

    # 6. Save message turn in database
    try:
        clean_email = payload.user_email.strip().lower() if payload.user_email else None
        chat_record = ChatMessageDB(
            user_id="farmer",
            user_email=clean_email,
            record_uuid=payload.record_uuid or (analysis_data.get("record_uuid") if analysis_data else None),
            field_name=field_name,
            message=user_message,
            response=chat_result["reply"],
            model_used=chat_result.get("model_used", "gemini-2.5-flash"),
        )
        db.add(chat_record)
        db.commit()
    except Exception as dbe:
        logger.warning(f"Could not persist chat message: {dbe}")
        db.rollback()

    return ChatResponse(
        reply=chat_result["reply"],
        record_uuid=payload.record_uuid or (analysis_data.get("record_uuid") if analysis_data else None),
        model_used=chat_result.get("model_used", "gemini-2.5-flash"),
        source_context_used=chat_result.get("source_context_used", False),
        status=chat_result.get("status", "ok"),
    )


@router.get("/chat/history", response_model=List[ChatMessageItem], tags=["AI Assistant (Gemini)"])
def get_chat_history(
    user_email: Optional[str] = Query(None, description="Filter history by authenticated user email"),
    record_uuid: Optional[str] = Query(None, description="Filter history by analysis record UUID"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Retrieves previous conversation turns scoped to the authenticated user and analysis session.
    """
    query = db.query(ChatMessageDB)
    if user_email and user_email.strip():
        query = query.filter(ChatMessageDB.user_email == user_email.strip().lower())
    if record_uuid:
        query = query.filter(ChatMessageDB.record_uuid == record_uuid)
    
    records = query.order_by(ChatMessageDB.created_at.desc()).limit(limit).all()
    records.reverse()  # Chronological order

    items = []
    for r in records:
        items.append(ChatMessageItem(role="user", content=r.message))
        items.append(ChatMessageItem(role="assistant", content=r.response))

    return items
