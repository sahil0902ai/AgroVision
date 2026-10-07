import logging
import os
from fastapi.responses import RedirectResponse

from .api.auth import router as auth_router
from .api.cnn import router as cnn_router
from .api.snn import router as snn_router
from .api.analysis import router as analysis_router
from .api.weather import router as weather_router
from .api.chat import router as chat_router
from .api.settings import router as settings_router
from .api.v1.api import api_router
from .core.config import settings
from .core.database import init_db
from .schemas.snn_schema import HealthResponse
from .services.cnn_service import CNNService
from .services.snn_service import SNNService
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("agrovision.main")

app = FastAPI(
    title="AgroVision – Smart Cotton Farming API",
    description="AI-Based Cotton Plant Stress Detection and Environmental Risk Assessment platform.",
    version="1.0.0"
)

# CORS Middleware for cross-origin frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_static(request, call_next):
    """
    HTML, CSS, and JS must be revalidated so frontend updates
    reach users in real-time without stale browser caching.
    """
    response = await call_next(request)
    content_type = response.headers.get("content-type", "")
    if any(content_type.startswith(t) for t in ["text/html", "text/css", "application/javascript", "text/javascript"]):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Startup verification
@app.on_event("startup")
def startup_event() -> None:
    init_db()
    os.makedirs("uploads/images", exist_ok=True)
    os.makedirs("uploads/heatmaps", exist_ok=True)
    
    # Preload and verify CNN model
    logger.info("Initializing AgroVision CNN Inference Service...")
    cnn_service = CNNService.get_instance()
    if cnn_service.weights_loaded:
        logger.info("[Startup] CNN model loaded and ready for visual stress inference.")
    else:
        logger.warning("[Startup] Notice: CNN model weights not loaded. Please ensure best_agrovision_cnn.pth is in backend/models/.")

    # Preload and verify SNN model
    logger.info("Initializing AgroVision SNN Inference Service...")
    snn_service = SNNService.get_instance()
    if snn_service.weights_loaded:
        logger.info("[Startup] SNN model loaded and ready for environmental stress inference.")
    else:
        logger.warning("[Startup] Notice: SNN model weights not loaded. Please ensure agrovision_snn.pth is in backend/models/.")

# Mount CNN, SNN, Multimodal Analysis, Weather, Chat, Settings, and Auth API Routers
app.include_router(auth_router)
app.include_router(cnn_router, prefix="/api", tags=["CNN Visual Analysis"])
app.include_router(snn_router, prefix="/api", tags=["SNN Environmental Analysis"])
app.include_router(analysis_router, prefix="/api", tags=["Multimodal Analysis & Expert Veto"])
app.include_router(weather_router, prefix="/api", tags=["Weather & Environment"])
app.include_router(chat_router, prefix="/api", tags=["AI Assistant (Gemini)"])
app.include_router(settings_router, prefix="/api", tags=["Settings & Preferences"])
app.include_router(api_router, prefix="/api/v1", tags=["v1"])


@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    """
    Health check endpoint reporting whether CNN, SNN, OpenWeather, and Gemini services are ready.
    """
    cnn_service = CNNService.get_instance()
    snn_service = SNNService.get_instance()
    cnn_ready = cnn_service.weights_loaded
    snn_ready = snn_service.weights_loaded
    weather_configured = bool(settings.OPENWEATHER_API_KEY)
    gemini_configured = bool(settings.GEMINI_API_KEY)
    return HealthResponse(
        status="ok" if (cnn_ready and snn_ready) else "degraded",
        cnn_loaded=cnn_ready,
        snn_loaded=snn_ready,
        device=cnn_service.device.type,
        weather_api_configured=weather_configured,
        gemini_api_configured=gemini_configured,
        gemini_model=settings.GEMINI_MODEL,
    )

# Mount Static Uploads directory
if os.path.exists("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Mount Existing HTML Frontend if present
import pathlib
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent.parent  # backend/app -> project root
frontend_dir = BASE_DIR / "public"
if not frontend_dir.is_dir():
    frontend_dir = BASE_DIR / "frontend" / "agrovision"

if frontend_dir.is_dir():
    app.mount("/agrovision", StaticFiles(directory=str(frontend_dir), html=True), name="agrovision")
    logger.info(f"🔧 Front‑end mounted at /agrovision from {frontend_dir}")
else:
    logger.error(f"❌ Front‑end directory not found: {frontend_dir}")

@app.get("/", include_in_schema=False)
def redirect_root():
    """Redirect base URL to the front‑end landing page."""
    return RedirectResponse(url="/agrovision/")

# Preserve the original info as a separate endpoint
@app.get("/info")
def info():
    """Return API metadata (previous root response)."""
    return {
        "project": "AgroVision – Smart Cotton Farming",
        "message": "AI-Based Cotton Plant Stress Detection API is running.",
        "docs_url": "/docs",
        "frontend_demo": "/agrovision/dashboard.html",
        "health_check": "/api/health",
        "cnn_predict_endpoint": "/api/cnn/predict",
        "snn_predict_endpoint": "/api/snn/predict",
    }
