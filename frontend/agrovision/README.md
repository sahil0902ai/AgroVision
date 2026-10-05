# AgroVision — Front End

This is the front-end application for AgroVision:

- `index.html` — Home/landing page highlighting AI-assisted cotton plant stress detection and environmental risk assessment.
- `login.html` — Login and sign-up interface (uses client-side WebCrypto salted SHA-256 hashing).
- `dashboard.html` — Farmer dashboard providing leaf upload with deterministic CNN visual analysis and SNN environmental analysis.
- `services.html` — Services overview page.
- `about.html` — Mission and team page.
- `css/` — Design tokens, component stylesheets, and animations.
- `js/auth.js` — Client session management and password hashing.
- `js/dashboard.js` — Leaf image upload handling, CNN visual inference (`/api/cnn/predict`), and SNN environmental inference (`/api/snn/predict`).

## How to Run

The front end is automatically mounted and served by the FastAPI backend at:
```
http://localhost:8000/agrovision/
```

To run the backend server:
```powershell
cd backend
python run.py
```

## API Endpoints Used

- `GET /api/health` — Reports service status and model availability.
- `POST /api/cnn/predict` — Multipart upload of cotton leaf image for 5-class visual stress classification.
- `POST /api/snn/predict` — JSON environmental parameters for 3-class environmental stress assessment.

