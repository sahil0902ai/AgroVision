import os
from pathlib import Path


class Settings:
    """Centralized AgroVision backend configuration."""
    PROJECT_NAME: str = "AgroVision – Smart Cotton Farming"
    API_V1_STR: str = "/api/v1"
    
    # CNN Model Checkpoint Path (Configurable via environment variable)
    CNN_MODEL_PATH: str = os.getenv(
        "CNN_MODEL_PATH",
        str(Path(__file__).parent.parent.parent / "models" / "best_agrovision_cnn.pth")
    )  # noqa: B008

    # SNN Model Checkpoint Path (Configurable via environment variable)
    SNN_MODEL_PATH: str = os.getenv(
        "SNN_MODEL_PATH",
        str(Path(__file__).parent.parent.parent / "models" / "agrovision_snn.pth")
    )  # noqa: B008
    
    # Maximum upload image size in megabytes
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
    
    # Advisory confidence threshold for screening warnings
    CONFIDENCE_ADVISORY_THRESHOLD: float = float(os.getenv("CONFIDENCE_ADVISORY_THRESHOLD", "0.60"))
    
    from typing import ClassVar, Set
    # Allowed MIME types for uploaded leaf images
    ALLOWED_IMAGE_MIMES: ClassVar[Set[str]] = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    }

settings = Settings()
