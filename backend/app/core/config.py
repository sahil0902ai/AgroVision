import os
from pathlib import Path
from typing import ClassVar, Set

try:
    from dotenv import load_dotenv
    # Load .env from project root or backend dir
    root_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    backend_env = Path(__file__).resolve().parent.parent.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env)
    elif backend_env.exists():
        load_dotenv(backend_env)
    else:
        load_dotenv()
except ImportError:
    pass


class Settings:
    """Centralized AgroVision backend configuration."""
    PROJECT_NAME: str = "AgroVision – Smart Cotton Farming"
    API_V1_STR: str = "/api/v1"
    
    # CNN Model Checkpoint Path (Configurable via environment variable)
    CNN_MODEL_PATH: str = os.getenv(
        "CNN_MODEL_PATH",
        str(Path(__file__).parent.parent.parent / "models" / "best_agrovision_cnn.pth")
    )

    # SNN Model Checkpoint Path (Configurable via environment variable)
    SNN_MODEL_PATH: str = os.getenv(
        "SNN_MODEL_PATH",
        str(Path(__file__).parent.parent.parent / "models" / "agrovision_snn.pth")
    )
    
    # Maximum upload image size in megabytes
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
    
    # Advisory confidence threshold for screening warnings
    CONFIDENCE_ADVISORY_THRESHOLD: float = float(os.getenv("CONFIDENCE_ADVISORY_THRESHOLD", "0.60"))
    
    # OpenWeather API Configuration
    OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "").strip()
    WEATHER_CACHE_TTL_SECONDS: int = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", "900"))
    
    # Google Gemini API Configuration
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
    
    # Allowed MIME types for uploaded leaf images
    ALLOWED_IMAGE_MIMES: ClassVar[Set[str]] = {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    }


settings = Settings()
