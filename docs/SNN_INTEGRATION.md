# AgroVision SNN Integration — Developer Documentation

This document describes the integration of the **real trained AgroVision SNN**
into the application: checkpoint, architecture, preprocessing, API, frontend
wiring, verification results, and known limitations.

Multimodal fusion and combined AI decision support are intentionally **not**
implemented yet. CNN (`POST /api/cnn/predict`) and SNN (`POST /api/snn/predict`)
operate independently.

---

## 1. Checkpoint

| Item | Value |
|---|---|
| File | `backend/models/agrovision_snn.pth` |
| Type | Plain `state_dict` (`collections.OrderedDict`), saved by `notebooks/snn_training.ipynb` cell 48 |
| Keys | `fc1/fc2/fc3` (weight, bias) + `lif1/lif2/lif3` (`beta`, `threshold`, `graded_spikes_factor`, `reset_mechanism_val`) |
| Hyperparameters in checkpoint | β = 0.95, threshold = 1.0, graded_spikes_factor = 1.0, reset_mechanism = 0 ("subtract") |

The `lif*` key names are exactly snnTorch's `snn.Leaky` state entries, proving
the model was trained with snnTorch. It loads with `strict=True` **only** into
the snnTorch-based definition in `backend/ai_models/agrovision_snn.py`
(the previous custom `LeakyLIFNeuron` in that file had different dynamics and
no matching keys, so it was replaced).

## 2. Architecture (unchanged from training)

Notebook cell 36, reproduced exactly:

```
33 → Linear(33, 64) → Leaky LIF (β=0.95, fast_sigmoid surrogate)
  → Linear(64, 64) → Leaky LIF
  → Linear(64, 3)  → Leaky LIF
```

- Static input presented at each of **T = 10** time steps.
- Decoding (training cells 39/44): **sum output spikes over time → argmax**.

## 3. Class mapping (verified from notebook output, cell 29)

`LabelEncoder` (alphabetical): **0 = High, 1 = Low, 2 = Moderate** — preserved
as `SNN_CLASSES` in `backend/ai_models/agrovision_snn.py`.

## 4. The 33 input features (exact order)

28 numeric features, then 5 one-hot `growth_stage` columns (notebook cell 22
output — alphabetical order):

```
 0 latitude              10 NDVI                  20 month
 1 longitude             11 EVI                   21 light
 2 days_since_sowing     12 GNDVI                 22 AQI
 3 air_temperature_C     13 SIF_740               23 ozone
 4 rainfall_mm           14 F687                  24 time_index
 5 humidity_percent      15 F760                  25 date_day
 6 soil_moisture         16 fluorescence_ratio    26 date_month
 7 soil_nitrogen         17 chlorophyll_content   27 date_year
 8 soil_phosphorus       18 leaf_area_index       28 growth_stage_Boll_Development
 9 soil_potassium        19 year                  29 growth_stage_Flowering
                                                  30 growth_stage_Maturity
                                                  31 growth_stage_Sowing
                                                  32 growth_stage_Vegetative
```

Feature provenance at inference time:

- **Six environmental sliders** → `air_temperature_C`, `humidity_percent`,
  `rainfall_mm`, `soil_moisture`, `AQI`, `ozone` (native training units).
- **Observation date** → `year`, `month`, `date_day`, `date_month`,
  `date_year`, `time_index` (the API uses today's date when
  `observation_date` is omitted).
- **Fixed frontend defaults** → `latitude`, `longitude`, `growth_stage`,
  `days_since_sowing`, `soil_nitrogen`, `soil_phosphorus`, `soil_potassium`,
  `light`, and the canopy/spectral inputs (`NDVI`, `EVI`, `GNDVI`, `SIF_740`,
  `F687`, `F760`, `fluorescence_ratio`, `chlorophyll_content`,
  `leaf_area_index`). The dashboard's "Additional Environmental Data" form was
  removed on product request (2026-10-04); the frontend now sends the same
  training-range midpoint values the form was prefilled with, defined in
  `SNN_FIXED_INPUTS` in `frontend/agrovision/js/dashboard.js`. The backend
  schema and validation are unchanged — every field is still required, so the
  values remain visible in each API request and can be replaced by a real
  data source (field records / sensor API) later without backend changes.

`time_index` is the dataset's cumulative cotton-season day counter, verified
against all 14,980 rows:

```
time_index = (date − June 1 of that year).days + 214 × (year − 2019)
```

## 5. Preprocessing pipeline (exact training reproduction)

Training (notebook cells 5–28) and deployment (`backend/ai_models/snn_preprocessing.py`):

1. read `datasets/Agrovision Cotoon SNN Dataset.csv`
2. drop duplicate rows
3. parse `date` → derive `date_day`, `date_month`, `date_year`
4. sort by `date` (chronological)
5. split 70 % train / 15 % val / 15 % test
6. drop `date, field_id, location, district, region, dataset,
   environmental_stress_score, environmental_stress_risk, stress_label,
   temperature` (targets / leakage / identifiers / duplicate of air_temperature_C)
7. one-hot encode `growth_stage` (5 alphabetical columns)
8. replace ±inf → NaN, fill NaN with **train** medians
9. `MinMaxScaler` **fit on the training split only**

### Scaler artifact

The original `agrovision_scaler.pkl` was not supplied with the checkpoint.
Because the pipeline above is fully deterministic and the training CSV is in
the repository, the scaler is **re-derived exactly** by replaying the notebook
steps and stored as `backend/models/agrovision_snn_preprocessing.json`
(feature order, per-feature min/max, train medians). This is a reproduction of
the training scaler, not a new fit — validated by the parity test below.
If the JSON is missing at startup it is rebuilt from the CSV automatically.

The live API never fits a scaler on user input and never accepts
target-leakage columns (`environmental_stress_score`, `environmental_stress_risk`,
`stress_label`) as input.

## 6. Model loading & inference

- `backend/app/services/snn_service.py` — singleton, loads the checkpoint once
  at startup (CPU/GPU detected), `model.eval()` retained in memory; per-request
  reload never happens.
- Inference runs under `torch.inference_mode()`; T = 10 spiking steps;
  sum of output spikes → class.
- **Scores**: the training loss was cross-entropy over the summed output
  spikes, so the softmax over those sums is the model-consistent class score.
  It is reported as *output spike activity score* together with the raw
  per-class spike counts — spike counts are never silently relabelled as
  confidence, and the research-level 91.81 % test accuracy is never shown as a
  live prediction confidence.

## 7. API

### `POST /api/snn/predict`

Explicit request schema (`backend/app/schemas/snn_schema.py`) — every field is
a real model input; nothing may be omitted (no defaults, no imputation):

```json
{
  "temperature": 31.0, "humidity": 72.0, "rainfall": 18.0,
  "soil_moisture": 0.42, "aqi": 84.0, "ozone": 0.041,
  "latitude": 21.0, "longitude": 78.5,
  "growth_stage": "Flowering", "days_since_sowing": 60,
  "soil_nitrogen": 280.0, "soil_phosphorus": 12.0, "soil_potassium": 120.0,
  "ndvi": 0.55, "evi": 0.35, "gndvi": 0.45,
  "sif_740": 1.2, "f687": 1.0, "f760": 1.3,
  "fluorescence_ratio": 0.8, "chlorophyll_content": 40.0,
  "leaf_area_index": 2.5, "light": 600.0,
  "observation_date": "2025-08-15"
}
```

Units are the **native training units**: `soil_moisture` is volumetric
(m³/m³) — not %, and `ozone` is in the training-native scale — not ppb.
`soil_nitrogen` must be 280 (constant across the entire training dataset; any
other value is outside the trained support and rejected).

**Extended slider ranges (2026-10-04, product request):** the six
environmental measurements accept values beyond the trained support so they
can be set larger or smaller than training conditions — temperature 0–55 °C,
humidity 0–100 %, rainfall 0–250 mm, soil moisture 0–0.80, AQI 0–500, ozone
0–0.20 (`EXTENDED_INPUT_RANGES` in `backend/ai_models/snn_preprocessing.py`).
The MinMax transform then extrapolates (scaled below 0 or above 1); such
predictions are out-of-distribution and should be treated as indicative only.

Response:

```json
{
  "success": true,
  "model": "AgroVision SNN",
  "prediction": { "class": "Moderate", "class_index": 2, "confidence": 0.731 },
  "class_scores": { "High": 0.0001, "Low": 0.2689, "Moderate": 0.731 },
  "spike_counts": { "High": 0, "Low": 8, "Moderate": 9 },
  "timesteps": 10,
  "environmental_inputs": { "temperature": 31.0, "...": "..." },
  "inference_time_ms": 91.16
}
```

Error handling: missing/invalid input → `422` with the exact field and, where
applicable, the trained range in the message; model unavailable → `503`;
unexpected failure → `500` (no stack traces leak to clients).

### `GET /api/health`

```json
{ "status": "ok", "cnn_loaded": true, "snn_loaded": true, "device": "cpu" }
```

`status` is `"degraded"` if either model failed to load.

## 8. Frontend integration (minimal changes)

- `frontend/agrovision/dashboard.html` — panel 2 now has six editable sliders
  (existing tile design, native training units) with live value display and an
  **Analyze Environment →** button. A new **panel 4: SNN Environmental
  Analysis** displays the result. (The "Additional Environmental Data" form
  that originally collected the remaining 18 inputs was removed on product
  request; see "Feature provenance" above for how those values are sourced
  now.)
- `frontend/agrovision/js/dashboard.js` — `collectSNNPayload()` (client-side
  completeness validation), `runEnvironmentAnalysis()` (POST, loading state,
  error mapping), `renderSNNResult()` (verdict, class scores + spike counts,
  key inputs echo, result-derived explanation). The values displayed are
  exactly the values sent.
- `frontend/agrovision/css/style.css` — styles for sliders / extra-data grid,
  reusing existing design tokens. No redesign of the existing dashboard.

## 9. Verification results

| Check | Result |
|---|---|
| Preprocessing parity: reproduced pipeline + checkpoint on the reconstructed test split | **0.9181 accuracy — exactly matches the training notebook** (`backend/scripts/validate_snn_parity.py`) |
| Production JSON transform vs sklearn scaler | bit-exact (max diff 5.6e-15); 0.9181 through deployed code path |
| Real test-split records (High / Low / Moderate) through deployed API | API == engine == actual class for all three |
| `POST /api/cnn/predict` regression | still 200, e.g. Water Stress 94.04 % |
| Health endpoint | `{"status":"ok","cnn_loaded":true,"snn_loaded":true}` |
| Error scenarios | missing field / invalid growth stage / value outside trained support / wrong nitrogen → 422 with clear messages |
| Inference time | ~10–20 ms per request (CPU) after startup |
| Browser UI test | sliders render + live-sync, analysis end-to-end, result card renders, layout consistent |

## 10. Known limitations

1. **Calendar extrapolation**: the model was trained on seasons 2019–2025.
   Observation dates in 2026+ produce `year` / `time_index` values outside the
   trained range; the transform extrapolates linearly (no clipping), which is
   honest but out-of-distribution. Documented in the UI date field and here.
2. **Extended slider ranges extrapolate**: slider/API values outside the
   trained support (see accepted ranges above) are linearly extrapolated by
   the scaler; the further from training conditions, the less reliable the
   prediction.
3. **`soil_nitrogen` is a constant** (280) in training data — it carries no
   information and must be sent as 280.
4. **Removed input form → default-based predictions**: with the Additional
   Environmental Data form removed, the 18 agronomic/canopy features are fixed
   defaults (training-range midpoints). Predictions are therefore driven by
   the six sliders + observation date under assumed field conditions; treat
   results as indicative until those inputs come from real field data.
5. The slider defaults and `SNN_FIXED_INPUTS` are **midpoints of the training
   ranges** — visible starting values, not hidden substitutions.
6. The scaler artifact is re-derived from the training CSV; if the CSV changes,
   delete `backend/models/agrovision_snn_preprocessing.json` so it rebuilds
   (and re-run the parity test).

## 11. Useful commands

```bash
# start backend (from backend/)
python run.py

# preprocessing parity test (must print 0.9181)
python scripts/validate_snn_parity.py

# end-to-end API + CNN regression scenarios
python scripts/run_integration_tests.py

# engine unit tests
python test_snn_module.py && python test_snn_inference.py
```
