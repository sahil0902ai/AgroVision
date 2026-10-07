import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal, init_db
from backend.app.models.db_models import UserDB, AnalysisRecordDB, ChatMessageDB, UserSettingsDB


class TestAuthAndScoping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def setUp(self):
        # Clean up test users
        db = SessionLocal()
        try:
            db.query(UserDB).filter(UserDB.email.in_(["tester_alpha@agrovision.org", "tester_beta@agrovision.org"])).delete(synchronize_session=False)
            db.query(UserSettingsDB).filter(UserSettingsDB.email.in_(["tester_alpha@agrovision.org", "tester_beta@agrovision.org"])).delete(synchronize_session=False)
            db.query(AnalysisRecordDB).filter(AnalysisRecordDB.user_email.in_(["tester_alpha@agrovision.org", "tester_beta@agrovision.org"])).delete(synchronize_session=False)
            db.query(ChatMessageDB).filter(ChatMessageDB.user_email.in_(["tester_alpha@agrovision.org", "tester_beta@agrovision.org"])).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

    def test_registration_and_login_flow(self):
        # 1. Register User Alpha
        reg_payload = {
            "name": "Alpha Farmer",
            "email": "tester_alpha@agrovision.org",
            "password": "SecurePassword123!"
        }
        res_reg = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res_reg.status_code, 201)
        data_reg = res_reg.json()
        self.assertTrue(data_reg["success"])
        self.assertEqual(data_reg["user"]["email"], "tester_alpha@agrovision.org")
        self.assertIn("token", data_reg["user"])

        # 2. Duplicate registration should fail
        res_dup = self.client.post("/api/auth/register", json=reg_payload)
        self.assertEqual(res_dup.status_code, 400)

        # 3. Login with correct password
        login_payload = {
            "email": "tester_alpha@agrovision.org",
            "password": "SecurePassword123!"
        }
        res_login = self.client.post("/api/auth/login", json=login_payload)
        self.assertEqual(res_login.status_code, 200)
        data_login = res_login.json()
        self.assertTrue(data_login["success"])
        self.assertEqual(data_login["user"]["name"], "Alpha Farmer")

        # 4. Login with incorrect password should fail
        res_bad_login = self.client.post("/api/auth/login", json={
            "email": "tester_alpha@agrovision.org",
            "password": "WrongPassword!"
        })
        self.assertEqual(res_bad_login.status_code, 401)

    def test_forgot_and_reset_password_flow(self):
        # Register user
        self.client.post("/api/auth/register", json={
            "name": "Reset Tester",
            "email": "tester_beta@agrovision.org",
            "password": "OldPassword123!"
        })

        # Request forgot password
        res_forgot = self.client.post("/api/auth/forgot-password", json={
            "email": "tester_beta@agrovision.org"
        })
        self.assertEqual(res_forgot.status_code, 200)
        code = res_forgot.json().get("reset_code_preview")
        self.assertIsNotNone(code)

        # Reset password with invalid code should fail
        res_bad_reset = self.client.post("/api/auth/reset-password", json={
            "email": "tester_beta@agrovision.org",
            "reset_code": "000000",
            "new_password": "NewBrandPassword123!"
        })
        self.assertEqual(res_bad_reset.status_code, 400)

        # Reset password with correct code
        res_reset = self.client.post("/api/auth/reset-password", json={
            "email": "tester_beta@agrovision.org",
            "reset_code": code,
            "new_password": "NewBrandPassword123!"
        })
        self.assertEqual(res_reset.status_code, 200)

        # Login with new password
        res_new_login = self.client.post("/api/auth/login", json={
            "email": "tester_beta@agrovision.org",
            "password": "NewBrandPassword123!"
        })
        self.assertEqual(res_new_login.status_code, 200)

    def test_strict_multi_user_data_isolation(self):
        # Register Alpha and Beta
        self.client.post("/api/auth/register", json={
            "name": "User Alpha",
            "email": "tester_alpha@agrovision.org",
            "password": "PasswordAlpha123!"
        })
        self.client.post("/api/auth/register", json={
            "name": "User Beta",
            "email": "tester_beta@agrovision.org",
            "password": "PasswordBeta123!"
        })

        # Insert an analysis record for User Alpha
        db = SessionLocal()
        try:
            rec_alpha = AnalysisRecordDB(
                record_uuid="AV-ALPHA-TEST-1234",
                user_email="tester_alpha@agrovision.org",
                field_name="Alpha Parcel 1",
                image_url="http://test/img.png",
                temperature=32.5,
                humidity=65.0,
                soil_moisture=0.45,
                rainfall_mm=10.0,
                stress_severity="High",
                confidence_score=94.5,
                cnn_predictions_json='{"water_stress": 92.0}',
                spike_counts_json='[12, 1, 0]',
                recommendations_json='["Apply irrigation"]',
            )
            db.add(rec_alpha)

            # Add a chat message for Alpha
            chat_alpha = ChatMessageDB(
                user_email="tester_alpha@agrovision.org",
                field_name="Alpha Parcel 1",
                message="How is my crop doing?",
                response="Your crop has water stress.",
            )
            db.add(chat_alpha)
            db.commit()
        finally:
            db.close()

        # 1. Check records scoping for Alpha vs Beta
        res_alpha_records = self.client.get("/api/v1/records?user_email=tester_alpha@agrovision.org")
        self.assertEqual(res_alpha_records.status_code, 200)
        records_alpha = res_alpha_records.json()
        self.assertEqual(len(records_alpha), 1)
        self.assertEqual(records_alpha[0]["record_uuid"], "AV-ALPHA-TEST-1234")

        res_beta_records = self.client.get("/api/v1/records?user_email=tester_beta@agrovision.org")
        self.assertEqual(res_beta_records.status_code, 200)
        records_beta = res_beta_records.json()
        # Beta must have ZERO records (empty state)
        self.assertEqual(len(records_beta), 0)

        # 2. Check analytics summary scoping for Alpha vs Beta
        res_alpha_summary = self.client.get("/api/v1/analytics/summary?user_email=tester_alpha@agrovision.org")
        self.assertEqual(res_alpha_summary.json()["total_scans"], 1)

        res_beta_summary = self.client.get("/api/v1/analytics/summary?user_email=tester_beta@agrovision.org")
        self.assertEqual(res_beta_summary.json()["total_scans"], 0)

        # 3. Check trend scoping for Beta
        res_beta_trend = self.client.get("/api/v1/analytics/trend?user_email=tester_beta@agrovision.org")
        self.assertFalse(res_beta_trend.json()["has_sufficient_data"])
        self.assertEqual(res_beta_trend.json()["total_records"], 0)

        # 4. Check chat history scoping for Beta
        res_beta_chat = self.client.get("/api/chat/history?user_email=tester_beta@agrovision.org")
        self.assertEqual(len(res_beta_chat.json()), 0)

        res_alpha_chat = self.client.get("/api/chat/history?user_email=tester_alpha@agrovision.org")
        self.assertEqual(len(res_alpha_chat.json()), 2)  # 1 user + 1 assistant


if __name__ == "__main__":
    unittest.main()
