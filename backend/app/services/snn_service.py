import logging
from pathlib import Path
from typing import Any, Optional

import torch

try:
    from ai_models.snn_inference import SNNInferenceEngine
except ImportError:
    from backend.ai_models.snn_inference import SNNInferenceEngine

from ..core.config import settings

logger = logging.getLogger("agrovision.snn_service")


class SNNService:
    """
    AgroVision SNN Environmental Stress Inference Service.
    - Singleton: loads the trained SNN checkpoint once at startup (CPU/GPU).
    - Reproduces the exact training preprocessing (train-fitted MinMaxScaler).
    - Inference runs in eval mode under torch.inference_mode(); the model stays
      in memory and is never reloaded per request.
    """

    _instance: Optional["SNNService"] = None

    def __init__(self, model_path: str | None = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        resolved = model_path or settings.SNN_MODEL_PATH
        self.engine = SNNInferenceEngine(weights_path=resolved, device=self.device)
        self.weights_loaded = self.engine.weights_loaded
        if not self.weights_loaded:
            logger.error(
                "CRITICAL: SNN model could not be loaded. "
                f"Expected trained checkpoint 'agrovision_snn.pth' (looked for '{resolved}' and standard models/ locations)."
            )

    @classmethod
    def get_instance(cls, model_path: str | None = None) -> "SNNService":
        if cls._instance is None:
            cls._instance = SNNService(model_path=model_path)
        return cls._instance

    @property
    def model_path(self) -> str | None:
        return self.engine.weights_path

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Runs spiking inference for one environmental record.
        Raises ValueError for missing/invalid inputs (mapped to HTTP 422 by the
        API layer) and RuntimeError when the model is unavailable (HTTP 503).
        """
        if not self.weights_loaded:
            raise RuntimeError("SNN model is not available.")

        logger.info("SNN prediction request received.")
        result = self.engine.predict(payload)
        logger.info(
            f"SNN preprocessing + inference completed in {result['inference_time_ms']}ms "
            f"-> Environmental stress: {result['predicted_severity']}"
        )
        return result
