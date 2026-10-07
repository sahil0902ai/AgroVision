import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import init_db, SessionLocal
from backend.app.models.db_models import UserSettingsDB

class TestSettingsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def tearDown(self):
        # Clean test records
        db = SessionLocal()
        try:
            db.query(UserSettingsDB).filter(UserSettingsDB.email.like("%test%@agrovision.org")).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

    def test_get_settings_new_user(self):
        """GET /api/settings for a new user should return default configuration."""
        response = self.client.get("/api/settings?email=test_new_farmer@agrovision.org")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["settings"]["email"], "test_new_farmer@agrovision.org")
        self.assertIsNone(data["settings"]["phone"])  # Missing values are None / Not provided
        self.assertIsNone(data["settings"]["farm_name"])
        self.assertEqual(data["settings"]["account_role"], "Lead Farmer")
        self.assertEqual(data["settings"]["gemini_model"], "gemini-2.5-flash")

    def test_save_and_retrieve_settings(self):
        """POST /api/settings saves preferences and GET retrieves the persisted record."""
        payload = {
            "email": "test_operator@agrovision.org",
            "full_name": "Ramesh Patil",
            "phone": "+91 98230 12345",
            "account_role": "Lead Agronomist",
            "farm_name": "Patil Krishi Farm",
            "farm_location": "Wardha District, Maharashtra",
            "total_acreage": 24.5,
            "default_field_name": "Field B — South Canal Parcel",
            "default_field_lat": 20.745,
            "default_field_lon": 78.598,
            "soil_type": "Deep Vertisol Clay",
            "irrigation_type": "Drip Irrigation",
            "temp_unit": "Celsius (°C)",
            "rainfall_unit": "Millimeters (mm)",
            "moisture_unit": "Percentage (%)",
            "email_alerts": True,
            "sms_alerts": True,
            "expert_veto_alerts": True,
            "daily_weather_digest": False,
            "weekly_report": True,
            "auto_telemetry_sync": True,
            "sqlite_caching": True,
            "data_retention_days": 180,
            "low_bandwidth_mode": False,
            "gemini_model": "gemini-2.5-flash",
            "ai_depth": "Technical Agronomic",
            "ai_grounding": "Strict Deterministic Model & Veto Grounding",
            "auto_suggest_questions": True,
            "language": "Marathi (मराठी)",
            "timezone": "Asia/Kolkata (IST - UTC+5:30)",
            "date_format": "DD/MM/YYYY",
            "two_factor_enabled": True,
            "session_timeout_minutes": 30
        }

        # Save settings
        post_resp = self.client.post("/api/settings", json=payload)
        self.assertEqual(post_resp.status_code, 200)
        post_data = post_resp.json()
        self.assertTrue(post_data["success"])
        self.assertEqual(post_data["settings"]["full_name"], "Ramesh Patil")
        self.assertEqual(post_data["settings"]["phone"], "+91 98230 12345")
        self.assertEqual(post_data["settings"]["farm_name"], "Patil Krishi Farm")
        self.assertEqual(post_data["settings"]["language"], "Marathi (मराठी)")
        self.assertTrue(post_data["settings"]["two_factor_enabled"])

        # Retrieve settings
        get_resp = self.client.get("/api/settings?email=test_operator@agrovision.org")
        self.assertEqual(get_resp.status_code, 200)
        get_data = get_resp.json()
        self.assertEqual(get_data["settings"]["full_name"], "Ramesh Patil")
        self.assertEqual(get_data["settings"]["total_acreage"], 24.5)
        self.assertEqual(get_data["settings"]["default_field_name"], "Field B — South Canal Parcel")

    def test_invalid_email_validation(self):
        """GET and POST with invalid email should return 400 or 422."""
        resp_get = self.client.get("/api/settings?email=invalidemail")
        self.assertEqual(resp_get.status_code, 400)

        resp_post = self.client.post("/api/settings", json={"email": "not-an-email"})
        self.assertEqual(resp_post.status_code, 422)

if __name__ == "__main__":
    unittest.main()
