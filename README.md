# 🌱 AgroVision – Smart Cotton Farming

> **AI-Based Cotton Plant Stress Detection & Environmental Risk Assessment**

AgroVision is an agricultural AI platform designed to detect visual plant stress and assess microclimate environmental risks for cotton farming. It combines a Convolutional Neural Network (CNN) for leaf image diagnosis, a Spiking Neural Network (SNN) for neuromorphic environmental spike analysis, and a Multimodal Fusion & Expert Veto Engine.

---

## 🚀 Key Features

- **Dual-Stream AI Architecture**:
  - **Visual CNN Stream**: Efficient custom CNN predicting 5 stress classes (*Healthy, Water Stress, Heat Stress, Nutrient Deficiency, Pollution / Pesticide Burn*) with softmax confidence.
  - **Neuromorphic SNN Stream**: Spiking Neural Network evaluating 4 microclimatic parameters (*Temperature, Humidity, Soil Moisture, Light Intensity*) and outputting discrete spike counts (0–10 evidence pulses).
- **Multimodal Decision Fusion**: Weighted probability fusion with dynamic confidence calibration.
- **Deterministic Expert Veto Engine**: Rule-based safety overrides for severe environmental stress indicators.
- **Farmer-Centric Dashboard**:
  - Step 1: Leaf Image Upload & Environmental Sliders
  - Step 2: Visual Check (CNN Confidence & Feature Metrics)
  - Step 3: Environmental Check (SNN Discrete Spike Evidence)
  - Step 4: Combined Multimodal Assessment & Agronomic Recommendations
- **Interactive AI Agronomist Assistant**: Real-time contextual farming advice.
- **Field History & Export**: Complete inspection logs, date filtering, and CSV/PDF report generation.

---

## 🛠️ System Architecture

```text
Cotton Leaf Image ────────► CNN Visual Stream ────────┐
                                                       │
                                                       ▼
                                            Multimodal Fusion Engine ──► Final Assessment
                                                       ▲
                                                       │
Environmental Sensors ────► SNN Microclimate Stream ──┘
(Temp, Hum, Moist, Light)             │
                                      ▼
                             Expert Veto Rules
```

---

## 📦 Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── api/            # REST API endpoints (auth, predict, history, assistant)
│   │   ├── core/           # Config, security, and database sessions
│   │   ├── models/         # SQLAlchemy ORM models & Pydantic schemas
│   │   └── services/       # CNN service, SNN service, fusion & veto engine
│   ├── models/             # PyTorch model weights (.pth) & preprocessing scalers
│   ├── tests/              # Pytest test suite (unit, integration & edge-cases)
│   └── main.py             # FastAPI entrypoint
├── datasets/               # CSV datasets and sample leaves
├── docs/                   # Technical architecture & integration documentation
├── frontend/
│   └── agrovision/         # HTML5, Tailwind CSS, and Vanilla JS UI templates
├── notebooks/              # Jupyter notebooks for model training & evaluation
├── run.py                  # Server launcher
├── pyproject.toml          # Project dependencies & configuration
└── README.md
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Python 3.10+
- PyTorch & torchvision

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/<username>/<repo-name>.git
cd Cotton-Stress-Detection

# Create and activate virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 3. Run Application
```bash
python run.py
```
Open your browser and navigate to:
- **Dashboard**: `http://127.0.0.1:8000/agrovision/`
- **Interactive API Docs**: `http://127.0.0.1:8000/docs`

### 4. Run Test Suite
```bash
python -m pytest backend/tests/ -v
```

---

## 🔬 Stress Classes Supported

1. **Healthy**: Vigorous foliage, balanced canopy, optimal hydration.
2. **Water Stress**: Moisture deficit, wilted leaf margins, low turgor.
3. **Heat Stress**: High solar irradiance scorch, curled margins, thermal damage.
4. **Nutrient Deficiency**: Interveinal chlorosis, nitrogen/potassium imbalance.
5. **Pollution / Pesticide Burn**: Chemical droplet injury, localized necrotic spotting.

---

## 📜 License
MIT License. Open for research, agricultural development, and educational applications.
