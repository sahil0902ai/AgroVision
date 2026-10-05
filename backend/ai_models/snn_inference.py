# pyrefly: ignore [missing-import]
"""
AgroVision SNN inference engine.

Loads the trained checkpoint (backend/models/agrovision_snn.pth) into the exact
snn_training.ipynb architecture once, and runs spiking inference with the
training-fitted preprocessing (see snn_preprocessing.py).

Decoding matches training evaluation (notebook cells 39/44): sum output spikes
over T=10 time steps, argmax over classes. Class scores are softmax over the
summed spike counts — the same quantity the training cross-entropy operated
on. Spike counts are also returned raw.
"""
import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F

from ai_models.agrovision_snn import SNN_CLASSES, AgroVisionSNN
from ai_models.snn_preprocessing import (
    SNN_CAT_COLUMNS,
    SNN_NUMERIC_FEATURES,
    SNNPreprocessor,
)

logger = logging.getLogger("agrovision.snn_inference")


class SNNInferenceEngine:
    """
    Reusable PyTorch SNN inference engine for cotton environmental stress
    classification (High / Low / Moderate).
    - Loads model weights once; keeps the model in memory in eval mode.
    - Reproduces the exact training preprocessing (train-fitted MinMaxScaler).
    - Runs T=10 spiking inference under torch.inference_mode().
    """

    def __init__(self, weights_path: str | Path | None = None, device: torch.device | None = None):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.model = AgroVisionSNN(input_size=33, hidden_size=64, output_size=3, beta=0.95, timesteps=10)
        self.model.to(self.device)
        self.model.eval()
        self.weights_loaded = False
        self.weights_path: str | None = None

        resolved = self._find_checkpoint(weights_path)
        if resolved is None:
            logger.error(
                "SNN checkpoint not found. Place 'agrovision_snn.pth' in backend/models/ "
                "or pass weights_path explicitly."
            )
        else:
            try:
                state_dict = torch.load(resolved, map_location=self.device, weights_only=False)
                self.model.load_state_dict(state_dict)  # strict=True: exact architecture required
                self.model.eval()
                self.weights_loaded = True
                self.weights_path = str(resolved)
                logger.info(f"Trained SNN loaded from {resolved} on {self.device.type.upper()}.")
            except Exception as e:
                logger.error(f"Failed to load SNN weights from {resolved}: {e}", exc_info=True)

        self.preprocessor = SNNPreprocessor()

    @staticmethod
    def _find_checkpoint(preferred: str | Path | None) -> Path | None:
        if preferred:
            p = Path(preferred)
            if p.is_file():
                return p.resolve()
            module_dir = Path(__file__).resolve().parent.parent
            if (module_dir / preferred).is_file():
                return (module_dir / preferred).resolve()
            if (module_dir.parent / preferred).is_file():
                return (module_dir.parent / preferred).resolve()
            return None

        for candidate in (
            Path("models/agrovision_snn.pth"),
            Path("backend/models/agrovision_snn.pth"),
            Path("../models/agrovision_snn.pth"),
            Path(__file__).resolve().parent.parent / "models" / "agrovision_snn.pth",
        ):
            if candidate.is_file():
                return candidate.resolve()
        return None

    def _feature_row_from_dataset_record(self, record: dict) -> dict[str, float]:
        """
        Builds the 33-feature row from a raw training-dataset record (e.g. a
        CSV row), used for preprocessing-parity tests against real records.
        """
        row: dict[str, float] = {}
        for feature in SNN_NUMERIC_FEATURES:
            if feature in record and record[feature] is not None:
                row[feature] = float(record[feature])
        missing = [f for f in SNN_NUMERIC_FEATURES if f not in row]
        if "date" in record:
            dt = pd.to_datetime(record["date"])
            for key, value in (("date_day", dt.day), ("date_month", dt.month), ("date_year", dt.year)):
                if key in missing:
                    row[key] = float(value)
                    missing.remove(key)
        if missing:
            raise ValueError(f"Dataset record is missing required features: {', '.join(missing)}")

        stage = str(record.get("growth_stage", "")).strip()
        if stage not in [c.replace("growth_stage_", "") for c in SNN_CAT_COLUMNS]:
            raise ValueError(f"Dataset record has invalid growth_stage '{stage}'.")
        for cat in SNN_CAT_COLUMNS:
            row[cat] = 1.0 if cat == f"growth_stage_{stage}" else 0.0
        return row

    def predict(self, payload: dict) -> dict:
        """
        Runs spiking inference for one environmental record.

        `payload` is either the structured API payload (see
        SNNPreprocessor.build_feature_row) or a raw training-dataset record
        (dict / Series with the original dataset columns) for parity testing.

        Raises ValueError on missing/invalid inputs, RuntimeError when the
        model weights are unavailable.
        """
        if not self.weights_loaded:
            raise RuntimeError("SNN model is not available.")

        if isinstance(payload, pd.Series):
            payload = payload.to_dict()

        if "stress_label" in payload or "date" in payload:
            # Raw training-dataset record (CSV row) used for parity testing;
            # the structured API payload never carries these columns.
            feature_row = self._feature_row_from_dataset_record(payload)
        else:
            feature_row = self.preprocessor.build_feature_row(payload)

        scaled = self.preprocessor.transform(feature_row)
        input_tensor = torch.tensor(scaled, dtype=torch.float32, device=self.device).unsqueeze(0)

        start_time = time.perf_counter()
        self.model.eval()
        with torch.inference_mode():
            spike_stack = self.model(input_tensor)  # (T, 1, 3)
            spike_sums = spike_stack.sum(dim=0).squeeze(0)  # (3,)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        spike_counts_np = spike_sums.cpu().numpy()
        pred_idx = int(np.argmax(spike_counts_np))

        # Training evaluated cross-entropy on the summed output spikes, so the
        # softmax over those sums is the model-consistent class score.
        probs = F.softmax(spike_sums, dim=0).cpu().numpy()

        return {
            "predicted_severity": SNN_CLASSES[pred_idx],
            "predicted_class_index": pred_idx,
            "class_scores": {SNN_CLASSES[i]: round(float(probs[i]), 4) for i in range(3)},
            "spike_counts": {SNN_CLASSES[i]: int(spike_counts_np[i]) for i in range(3)},
            "total_spikes": int(spike_counts_np.sum()),
            "timesteps": self.model.timesteps,
            "inference_time_ms": duration_ms,
            "weights_loaded": self.weights_loaded,
        }
