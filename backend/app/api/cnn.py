import logging

from ..core.config import settings
from ..schemas.cnn_schema import CNNPredictResponse
from ..services.cnn_service import CNNService
from fastapi import APIRouter, File, HTTPException, UploadFile, status

logger = logging.getLogger("agrovision.cnn_api")

router = APIRouter()

@router.post("/cnn/predict", response_model=CNNPredictResponse)
async def predict_leaf_stress(
    image: UploadFile | None = File(None),  # noqa: B008
    file: UploadFile | None = File(None)  # noqa: B008
):
    """
    Classifies cotton plant visual stress from an uploaded cotton leaf photo.
    
    Accepts:
        - multipart/form-data with 'image' (or 'file')
    
    Returns:
        - 5-class visual stress probability distribution
        - Top predicted class, confidence, and preprocessing metadata
    """
    upload = image or file
    if upload is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a cotton leaf image before starting analysis."
        )

    # 1. Validate file extension / MIME type
    content_type = upload.content_type or ""
    filename = (upload.filename or "").lower()
    
    is_valid_ext = filename.endswith((".jpg", ".jpeg", ".png", ".webp"))
    is_valid_mime = content_type in settings.ALLOWED_IMAGE_MIMES or content_type.startswith("image/")

    if not (is_valid_ext or is_valid_mime):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image format. Please upload JPG or PNG."
        )

    # 2. Read content & validate file size
    try:
        content = await upload.read()
    except Exception as e:
        logger.error(f"Error reading uploaded file: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected image could not be read. Please choose another image."
        )

    if not content or len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a cotton leaf image before starting analysis."
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image size is too large. Please upload a smaller image (max {settings.MAX_UPLOAD_SIZE_MB}MB)."
        )

    # 3. Check CNN service readiness
    cnn_service = CNNService.get_instance()
    if not cnn_service.weights_loaded:
        logger.error("Inference requested but CNN model weights are not loaded.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CNN model is not available. Please contact the system administrator."
        )

    # 4. Execute deterministic inference
    try:
        result = cnn_service.predict(content)
        return CNNPredictResponse(**result)
    except ValueError as ve:
        logger.warning(f"Image validation error: {ve}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The selected image could not be read. Please choose another image."
        )
    except Exception as e:
        logger.exception(f"Unexpected inference failure: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Visual analysis could not be completed. Please try again."
        )
