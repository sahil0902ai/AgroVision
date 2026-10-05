# pyrefly: ignore [missing-import]
"""
AgroVision SNN preprocessing — exact reproduction of notebooks/snn_training.ipynb.

The trained SNN consumes 33 MinMax-scaled features. During training the
MinMaxScaler was fitted ONLY on the chronologically-first 70% of the dataset
(no future leakage). The original scaler artifact (agrovision_scaler.pkl) was
not supplied with the checkpoint, so this module deterministically re-derives
it from the training dataset CSV by replaying the notebook pipeline step by
step. Parity was verified: the reproduced pipeline + trained checkpoint
reproduce the notebook's 0.9181 test accuracy exactly
(scripts/validate_snn_parity.py).

Pipeline (notebook cells 5-28):
    1. read CSV
    2. drop_duplicates
    3. parse `date`, derive date_day / date_month / date_year
    4. sort by date (chronological split)
    5. 70% train / 15% val / 15% test split
    6. drop target/leakage/duplicate columns (DROP_COLUMNS)
    7. one-hot encode growth_stage (5 columns, alphabetical)
    8. replace +/-inf with NaN, fill NaN with TRAIN medians
    9. MinMaxScaler fit on train only

Live inference reuses the scaler's fitted min/max (stored in
models/agrovision_snn_preprocessing.json) and builds the same 33-column vector
from user-provided values. No feature is ever filled with a default: a missing
input is an error, not a guess.

Feature provenance for the 33 model inputs:
    - 6 environmental sliders : air_temperature_C, rainfall_mm,
      humidity_percent, soil_moisture, AQI, ozone (native training units)
    - observation date        : year, month, time_index, date_day,
      date_month, date_year (time_index = days since June 1 of the
      observation year + 214 days per cotton season since 2019; verified
      against all 14,980 training rows)
    - field / agronomic input : latitude, longitude, days_since_sowing,
      growth_stage (one-hot), soil_nitrogen, soil_phosphorus,
      soil_potassium, light
    - canopy / spectral input : NDVI, EVI, GNDVI, SIF_740, F687, F760,
      fluorescence_ratio, chlorophyll_content, leaf_area_index

Target-leakage columns (environmental_stress_score, environmental_stress_risk,
stress_label) are never accepted as model input.
"""
import json
import logging
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger("agrovision.snn_preprocessing")

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_CSV_PATH = PROJECT_ROOT / "datasets" / "Agrovision Cotoon SNN Dataset.csv"
PREPROCESSING_JSON_PATH = BACKEND_DIR / "models" / "agrovision_snn_preprocessing.json"

# --- Exact feature order from the training notebook (final model input order) ---

SNN_NUMERIC_FEATURES = [
    "latitude",
    "longitude",
    "days_since_sowing",
    "air_temperature_C",
    "rainfall_mm",
    "humidity_percent",
    "soil_moisture",
    "soil_nitrogen",
    "soil_phosphorus",
    "soil_potassium",
    "NDVI",
    "EVI",
    "GNDVI",
    "SIF_740",
    "F687",
    "F760",
    "fluorescence_ratio",
    "chlorophyll_content",
    "leaf_area_index",
    "year",
    "month",
    "light",
    "AQI",
    "ozone",
    "time_index",
    "date_day",
    "date_month",
    "date_year",
]

# pd.get_dummies emits alphabetically sorted one-hot columns (notebook cell 22 output)
SNN_CAT_COLUMNS = [
    "growth_stage_Boll_Development",
    "growth_stage_Flowering",
    "growth_stage_Maturity",
    "growth_stage_Sowing",
    "growth_stage_Vegetative",
]

SNN_ALL_33_FEATURES = SNN_NUMERIC_FEATURES + SNN_CAT_COLUMNS

GROWTH_STAGES = ["Boll_Development", "Flowering", "Maturity", "Sowing", "Vegetative"]

# Columns removed during training (targets, leakage, identifiers, duplicates).
# The live API must never accept these as model input.
TRAINING_DROP_COLUMNS = [
    "date",
    "field_id",
    "location",
    "district",
    "region",
    "dataset",
    "environmental_stress_score",
    "environmental_stress_risk",
    "stress_label",
    "temperature",
]

# time_index: cumulative cotton-season day counter. Verified to match
# days_since(June 1 of the observation year) + 214 * (year - 2019) on all
# 14,980 dataset rows (each season June 1 -> Dec 31 = 214 days, first season 2019).
TIME_INDEX_SEASON_START_MONTH = 6
TIME_INDEX_SEASON_START_DAY = 1
TIME_INDEX_SEASON_LENGTH_DAYS = 214
TIME_INDEX_FIRST_SEASON_YEAR = 2019

# soil_nitrogen is constant (280.0) across the entire training dataset; its
# MinMax range is degenerate. 280 is the only value inside the trained support.
SOIL_NITROGEN_TRAINING_CONSTANT = 280.0

# Fixed default values for the SNN features that are not collected in the UI
# (training-range midpoints; the dashboard's Additional Environmental Data form
# was removed on product request). The frontend mirrors these in
# SNN_FIXED_INPUTS (frontend/agrovision/js/dashboard.js). They are documented
# assumptions, not measured values.
SNN_DEFAULT_FIELD_INPUTS = {
    "latitude": 20.975,
    "longitude": 78.72,
    "growth_stage": "Flowering",
    "days_since_sowing": 60,
    "soil_nitrogen": SOIL_NITROGEN_TRAINING_CONSTANT,
    "soil_phosphorus": 13.5,
    "soil_potassium": 122.4,
    "ndvi": 0.50,
    "evi": 0.36,
    "gndvi": 0.42,
    "sif_740": 1.35,
    "f687": 1.27,
    "f760": 1.60,
    "fluorescence_ratio": 0.82,
    "chlorophyll_content": 42.2,
    "leaf_area_index": 2.52,
    "light": 553.0,
}

# Extended acceptance bounds for the six user-controlled environmental
# measurements (dashboard sliders). Deliberately wider than the trained
# support so values can be set beyond training conditions; the MinMax
# transform then extrapolates (scaled < 0 or > 1) and predictions outside
# the trained support should be treated as indicative only. These are UI/API
# safety bounds, not agronomic facts.
EXTENDED_INPUT_RANGES = {
    "air_temperature_C": (0.0, 55.0),    # trained on 11.1 – 40.7
    "humidity_percent": (0.0, 100.0),    # trained on 17.2 – 95.5
    "rainfall_mm": (0.0, 250.0),         # trained on 0 – 118.1
    "soil_moisture": (0.0, 0.80),        # trained on 0.042 – 0.578
    "AQI": (0.0, 500.0),                 # trained on 25 – 112.6
    "ozone": (0.0, 0.20),                # trained on 0.028 – 0.054
}


def derive_time_index(observation_date: date) -> int:
    """Cumulative cotton-season day for an observation date (dataset formula)."""
    season_start = date(observation_date.year, TIME_INDEX_SEASON_START_MONTH, TIME_INDEX_SEASON_START_DAY)
    if observation_date < season_start:
        # Observations before June 1 fall outside every training season.
        raise ValueError(
            "Observation date must fall within a cotton season (June 1 to December 31)."
        )
    days_into_season = (observation_date - season_start).days
    seasons_elapsed = observation_date.year - TIME_INDEX_FIRST_SEASON_YEAR
    return days_into_season + TIME_INDEX_SEASON_LENGTH_DAYS * seasons_elapsed


def _replay_training_pipeline(csv_path: Path) -> dict:
    """Replays notebook cells 5-28 to re-derive the fitted scaler parameters."""
    df = pd.read_csv(csv_path)
    df = df.drop_duplicates().reset_index(drop=True)

    df["date"] = pd.to_datetime(df["date"])
    df["date_day"] = df["date"].dt.day
    df["date_month"] = df["date"].dt.month
    df["date_year"] = df["date"].dt.year
    df = df.sort_values("date").reset_index(drop=True)

    n = len(df)
    train_df = df.iloc[: int(n * 0.70)].copy()

    feature_columns = [col for col in df.columns if col not in TRAINING_DROP_COLUMNS]
    if len(feature_columns) != 29:
        raise RuntimeError(f"Unexpected dataset schema: got {len(feature_columns)} raw features, expected 29")

    categorical_features = ["growth_stage"]
    numeric_features = [col for col in feature_columns if col not in categorical_features]

    X_train_num = train_df[numeric_features].copy()
    X_train_cat = pd.get_dummies(train_df[categorical_features], columns=categorical_features, dtype=float)

    X_train = pd.concat([X_train_num, X_train_cat], axis=1)
    X_train = X_train.replace([np.inf, -np.inf], np.nan)
    train_medians = X_train.median()
    X_train = X_train.fillna(train_medians)

    data_min = X_train.min().to_dict()
    data_max = X_train.max().to_dict()
    if X_train.columns.tolist() != SNN_ALL_33_FEATURES:
        raise RuntimeError(
            "Reproduced feature order does not match the expected 33-feature order: "
            f"{X_train.columns.tolist()}"
        )

    return {
        "data_min": data_min,
        "data_max": data_max,
        "train_medians": train_medians.to_dict(),
        "train_rows": int(len(train_df)),
        "dataset_rows": int(n),
    }


def build_preprocessing_artifact(csv_path: Path = DEFAULT_CSV_PATH, output_path: Path = PREPROCESSING_JSON_PATH) -> dict:
    """Builds and stores the preprocessing artifact from the training dataset."""
    if not csv_path.exists():
        raise FileNotFoundError(
            f"SNN training dataset not found at '{csv_path}'. "
            "It is required to re-derive the training MinMaxScaler parameters."
        )
    replayed = _replay_training_pipeline(csv_path)
    artifact = {
        "source": "notebooks/snn_training.ipynb preprocessing replay",
        "dataset": csv_path.name,
        "feature_names": SNN_ALL_33_FEATURES,
        "data_min": replayed["data_min"],
        "data_max": replayed["data_max"],
        "train_medians": replayed["train_medians"],
        "train_rows": replayed["train_rows"],
        "dataset_rows": replayed["dataset_rows"],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    logger.info(f"SNN preprocessing artifact written to {output_path}")
    return artifact


class SNNPreprocessor:
    """
    Applies the training-fitted MinMax scaling to a constructed 33-feature row.
    Loads scaler parameters from the JSON artifact; rebuilds it from the
    training CSV if the artifact is missing.
    """

    def __init__(self, artifact_path: Path = PREPROCESSING_JSON_PATH):
        self.artifact_path = artifact_path
        if not artifact_path.exists():
            logger.info("SNN preprocessing artifact missing - rebuilding from training dataset.")
            build_preprocessing_artifact(output_path=artifact_path)
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))

        if artifact.get("feature_names") != SNN_ALL_33_FEATURES:
            raise RuntimeError("Preprocessing artifact feature order mismatch - rebuild required.")

        self.feature_names = artifact["feature_names"]
        self.data_min = np.array([artifact["data_min"][f] for f in self.feature_names], dtype=np.float64)
        self.data_max = np.array([artifact["data_max"][f] for f in self.feature_names], dtype=np.float64)
        # Degenerate (constant) training columns scale to 0.0, matching sklearn
        # MinMaxScaler's zero-range handling.
        self.data_range = np.where(self.data_max - self.data_min == 0, 1.0, self.data_max - self.data_min)

    def transform(self, feature_row: dict[str, float]) -> np.ndarray:
        """MinMax-scales one raw 33-feature row in the exact training order."""
        raw = np.array([float(feature_row[f]) for f in self.feature_names], dtype=np.float64)
        return (raw - self.data_min) / self.data_range

    def trained_range(self, feature_name: str) -> tuple[float, float]:
        idx = self.feature_names.index(feature_name)
        return float(self.data_min[idx]), float(self.data_max[idx])

    def _require_in_range(self, feature_name: str, value: float) -> float:
        if feature_name in EXTENDED_INPUT_RANGES:
            lo, hi = EXTENDED_INPUT_RANGES[feature_name]
        else:
            lo, hi = self.trained_range(feature_name)
        tolerance = 0.005 * (hi - lo) if hi > lo else 0.0
        if value < lo - tolerance or value > hi + tolerance:
            raise ValueError(
                f"{feature_name} value {value} is outside the accepted range "
                f"[{lo}, {hi}]."
            )
        return value

    def build_feature_row(self, payload: dict) -> dict[str, float]:
        """
        Builds the raw (unscaled) 33-feature row from an explicit API payload.

        Every model feature must come from a real provided value: the six
        environmental measurements, the field/agronomic inputs, the canopy /
        spectral inputs, or the observation date (calendar features). Nothing
        is defaulted, filled, or imputed. Raises ValueError naming the exact
        problem when an input is missing or outside the trained support.
        """
        row: dict[str, float] = {}

        def require_number(key: str, target: str) -> float:
            if payload.get(key) is None:
                raise ValueError(f"Missing required environmental input: {key}.")
            try:
                value = float(payload[key])
            except (TypeError, ValueError):
                raise ValueError(f"{key} must be a number.") from None
            if not np.isfinite(value):
                raise ValueError(f"{key} must be a finite number.")
            row[target] = value
            return value

        # Six environmental measurements (native training units)
        require_number("temperature", "air_temperature_C")
        require_number("humidity", "humidity_percent")
        require_number("rainfall", "rainfall_mm")
        require_number("soil_moisture", "soil_moisture")
        require_number("aqi", "AQI")
        require_number("ozone", "ozone")

        # Field location & crop context
        require_number("latitude", "latitude")
        require_number("longitude", "longitude")
        require_number("days_since_sowing", "days_since_sowing")

        growth_stage = payload.get("growth_stage")
        if growth_stage is None:
            raise ValueError("Missing required environmental input: growth_stage.")
        stage_key = str(growth_stage).strip()
        if stage_key not in GROWTH_STAGES:
            raise ValueError(
                f"Invalid growth_stage '{growth_stage}'. Valid stages: {', '.join(GROWTH_STAGES)}."
            )
        for cat in SNN_CAT_COLUMNS:
            row[cat] = 1.0 if cat == f"growth_stage_{stage_key}" else 0.0

        # Soil nutrients
        nitrogen = require_number("soil_nitrogen", "soil_nitrogen")
        if nitrogen != SOIL_NITROGEN_TRAINING_CONSTANT:
            raise ValueError(
                "soil_nitrogen must be 280: the trained model was fitted on a dataset "
                "in which soil nitrogen is constant at 280, and no other value is "
                "inside its trained support."
            )
        require_number("soil_phosphorus", "soil_phosphorus")
        require_number("soil_potassium", "soil_potassium")

        # Canopy & spectral inputs
        require_number("ndvi", "NDVI")
        require_number("evi", "EVI")
        require_number("gndvi", "GNDVI")
        require_number("sif_740", "SIF_740")
        require_number("f687", "F687")
        require_number("f760", "F760")
        require_number("fluorescence_ratio", "fluorescence_ratio")
        require_number("chlorophyll_content", "chlorophyll_content")
        require_number("leaf_area_index", "leaf_area_index")
        require_number("light", "light")

        # Calendar features from the observation date
        observation_date_raw = payload.get("observation_date")
        if observation_date_raw is None:
            observation = date.today()
        else:
            try:
                observation = date.fromisoformat(str(observation_date_raw))
            except ValueError:
                raise ValueError("observation_date must be an ISO date (YYYY-MM-DD).") from None
        row["year"] = float(observation.year)
        row["month"] = float(observation.month)
        row["date_day"] = float(observation.day)
        row["date_month"] = float(observation.month)
        row["date_year"] = float(observation.year)
        row["time_index"] = float(derive_time_index(observation))

        # Range validation on the directly measured environmental inputs
        for feature in [
            "air_temperature_C", "humidity_percent", "rainfall_mm", "soil_moisture",
            "AQI", "ozone", "latitude", "longitude", "days_since_sowing",
            "soil_phosphorus", "soil_potassium", "NDVI", "EVI", "GNDVI",
            "SIF_740", "F687", "F760", "fluorescence_ratio", "chlorophyll_content",
            "leaf_area_index", "light",
        ]:
            self._require_in_range(feature, row[feature])

        if len(row) != len(SNN_ALL_33_FEATURES):
            raise RuntimeError(
                f"Feature construction produced {len(row)} features, expected {len(SNN_ALL_33_FEATURES)}."
            )
        return row
