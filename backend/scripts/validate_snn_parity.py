# pyrefly: ignore [missing-import]
"""
SNN preprocessing parity validation.

Replays the exact preprocessing pipeline from notebooks/snn_training.ipynb
(Colab training) on datasets/Agrovision Cotoon SNN Dataset.csv, then runs the
trained checkpoint (agrovision_snn.pth) on the reconstructed test split.

PASS CRITERIA: test accuracy == 0.9181 (the accuracy reported by the training
notebook). If the reproduced preprocessing, feature order, or model dynamics
differ from training in any way, this number will not match.

Run from backend/:  python scripts/validate_snn_parity.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder, MinMaxScaler

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

CSV_PATH = PROJECT_ROOT / "datasets" / "Agrovision Cotoon SNN Dataset.csv"
CHECKPOINT_PATH = BACKEND_DIR / "models" / "agrovision_snn.pth"

DROP_COLUMNS = [
    "date",
    "field_id",
    "location",
    "district",
    "region",
    "dataset",
    # Target leakage
    "environmental_stress_score",
    "environmental_stress_risk",
    # Target
    "stress_label",
    # Duplicate of air_temperature_C
    "temperature",
]

# Exact snn_training.ipynb architecture (cell 36): snnTorch Leaky layers, T=10.
import snntorch as snn  # noqa: E402
import snntorch.surrogate as surrogate  # noqa: E402
from torch import nn  # noqa: E402


class AgroVisionSNN(nn.Module):
    def __init__(self, input_size, hidden_size=64, output_size=3, beta=0.95):
        super().__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.lif1 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.lif2 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())
        self.fc3 = nn.Linear(hidden_size, output_size)
        self.lif3 = snn.Leaky(beta=beta, spike_grad=surrogate.fast_sigmoid())

    def forward(self, x):
        mem1 = self.lif1.init_leaky()
        mem2 = self.lif2.init_leaky()
        mem3 = self.lif3.init_leaky()
        spike_record = []
        for _ in range(10):
            current1 = self.fc1(x)
            spike1, mem1 = self.lif1(current1, mem1)
            current2 = self.fc2(spike1)
            spike2, mem2 = self.lif2(current2, mem2)
            current3 = self.fc3(spike2)
            spike3, mem3 = self.lif3(current3, mem3)
            spike_record.append(spike3)
        return torch.stack(spike_record)


def replay_preprocessing():
    """Replays notebook cells 5-28 exactly, in order."""
    df = pd.read_csv(CSV_PATH)  # cell 5

    # cell 10
    df = df.drop_duplicates().reset_index(drop=True)

    # cell 14
    df["date"] = pd.to_datetime(df["date"])
    df["date_day"] = df["date"].dt.day
    df["date_month"] = df["date"].dt.month
    df["date_year"] = df["date"].dt.year

    # cell 15
    df = df.sort_values("date").reset_index(drop=True)

    # cell 17
    n = len(df)
    train_end = int(n * 0.70)
    val_end = int(n * 0.85)
    train_df = df.iloc[:train_end].copy()
    test_df = df.iloc[val_end:].copy()

    # cell 18
    feature_columns = [col for col in df.columns if col not in DROP_COLUMNS]
    # 29 raw features (28 numeric + growth_stage); growth_stage -> 5 one-hot = 33 model inputs
    assert len(feature_columns) == 29, f"expected 29 raw features, got {len(feature_columns)}"

    # cell 19-23
    categorical_features = ["growth_stage"]
    numeric_features = [col for col in feature_columns if col not in categorical_features]

    X_train_num = train_df[numeric_features].copy()
    X_train_cat = pd.get_dummies(train_df[categorical_features], columns=categorical_features, dtype=float)
    X_test_num = test_df[numeric_features].copy()
    X_test_cat = pd.get_dummies(test_df[categorical_features], columns=categorical_features, dtype=float)
    X_train_cat, X_test_cat = X_train_cat.align(X_test_cat, join="left", axis=1, fill_value=0)

    X_train = pd.concat([X_train_num, X_train_cat], axis=1)
    X_test = pd.concat([X_test_num, X_test_cat], axis=1)

    # cell 25
    X_train = X_train.replace([np.inf, -np.inf], np.nan)
    X_test = X_test.replace([np.inf, -np.inf], np.nan)
    train_medians = X_train.median()
    X_train = X_train.fillna(train_medians)
    X_test = X_test.fillna(train_medians)

    # cell 26
    scaler = MinMaxScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # cell 28
    label_encoder = LabelEncoder()
    y_train = label_encoder.fit_transform(train_df["stress_label"])
    y_test = label_encoder.transform(test_df["stress_label"])

    return {
        "feature_columns": X_train.columns.tolist(),
        "scaler": scaler,
        "train_medians": train_medians,
        "label_encoder": label_encoder,
        "X_train_scaled": X_train_scaled,
        "y_train": y_train,
        "X_test_scaled": X_test_scaled,
        "y_test": y_test,
        "train_df": train_df,
        "test_df": test_df,
    }


def verify_time_index_formula(df):
    """time_index in the dataset == cumulative cotton-season day: days since
    June 1 of the observation year + 214 days per season since 2019."""
    dt = pd.to_datetime(df["date"])
    season_day = (dt - pd.to_datetime(dt.dt.year.astype(str) + "-06-01")).dt.days
    expected = season_day + 214 * (dt.dt.year - 2019)
    matches = (df["time_index"] == expected).sum()
    print(f"time_index formula matches {matches}/{len(df)} rows")
    return bool(matches == len(df))


def main():
    print("=" * 60)
    print("SNN PREPROCESSING PARITY VALIDATION")
    print("=" * 60)

    data = replay_preprocessing()
    print(f"Raw feature columns ({len(data['feature_columns'])}):")
    for i, f in enumerate(data['feature_columns']):
        print(f"  {i:2d}. {f}")
    print("(growth_stage one-hot expands these 29 into 33 model inputs)")

    print(f"\nTrain classes: {data['label_encoder'].classes_.tolist()}")
    verify_time_index_formula(pd.read_csv(CSV_PATH))

    # Load trained checkpoint
    model = AgroVisionSNN(input_size=33, hidden_size=64, output_size=3, beta=0.95)
    ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu", weights_only=False)
    model.load_state_dict(ckpt)  # strict=True must succeed
    model.eval()
    print(f"\nCheckpoint loaded strict=True from {CHECKPOINT_PATH.name}")

    # Run the reconstructed test split through the trained model
    X_test_tensor = torch.tensor(data["X_test_scaled"], dtype=torch.float32)
    y_test = data["y_test"]
    preds = []
    with torch.no_grad():
        for start in range(0, len(X_test_tensor), 128):
            batch = X_test_tensor[start : start + 128]
            spike_output = model(batch)  # (T, B, 3)
            output = spike_output.sum(dim=0)
            preds.extend(torch.argmax(output, dim=1).cpu().numpy())
    preds = np.array(preds)

    acc = accuracy_score(y_test, preds)
    print(f"\nReproduced test accuracy : {acc:.4f}")
    print("Notebook reported        : 0.9181")

    if abs(acc - 0.9181) < 0.001:
        print("\nRESULT: PASS — deployed preprocessing exactly matches training.")
        return 0
    print("\nRESULT: FAIL — preprocessing does NOT match training. Do not deploy.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
