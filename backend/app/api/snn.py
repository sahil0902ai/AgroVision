import logging

from ..schemas.snn_schema import SNNPredictRequest, SNNPredictResponse
from ..services.snn_service import SNNService
from fastapi import APIRouter, HTTPException, status

logger = logging.getLogger("agrovision.snn_api")

router = APIRouter()


@router.post("/snn/predict", response_model=SNNPredictResponse)
def predict_environmental_stress(payload: SNNPredictRequest):
    """
    Classifies environmental stress level (High / Low / Moderate) from a
    complete set of field environmental, agronomic, and canopy measurements
    using the trained AgroVision SNN.

    All 33 model inputs must be provided explicitly — the endpoint never
    substitutes defaults for missing values. Values outside the trained
    model's support are rejected with the valid range in the message.
    """
    snn_service = SNNService.get_instance()
    if not snn_service.weights_loaded:
        logger.error("SNN inference requested but model weights are not loaded.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Environmental analysis is temporarily unavailable.",
        )

    try:
        result = snn_service.predict(payload.model_dump())
    except ValueError as ve:
        logger.warning(f"SNN input validation error: {ve}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as e:
        logger.exception(f"Unexpected SNN inference failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Environmental stress analysis could not be completed. Please try again.",
        )

    request_data = payload.model_dump()
    return SNNPredictResponse(
        prediction={
            "class": result["predicted_severity"],
            "class_index": result["predicted_class_index"],
            "confidence": result["class_scores"][result["predicted_severity"]],
        },
        class_scores=result["class_scores"],
        spike_counts=result["spike_counts"],
        timesteps=result["timesteps"],
        environmental_inputs={
            "temperature": request_data["temperature"],
            "humidity": request_data["humidity"],
            "rainfall": request_data["rainfall"],
            "soil_moisture": request_data["soil_moisture"],
            "aqi": request_data["aqi"],
            "ozone": request_data["ozone"],
            "growth_stage": request_data["growth_stage"],
            "observation_date": request_data["observation_date"],
        },
        inference_time_ms=result["inference_time_ms"],
    )
