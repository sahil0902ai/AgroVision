"""
Unit & Integration Tests for Analysis Records, Reporting, and CSV Export Endpoints.
"""

import json
import unittest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.db_models import Base, AnalysisRecordDB
from app.api.v1.endpoints.records import get_records, get_record, get_record_report_html, export_records_csv


class TestRecordsAndReports(unittest.TestCase):

    def setUp(self):
        # Create in-memory SQLite database for isolated testing
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()

        now = datetime.now(timezone.utc)
        # Seed sample analysis records
        self.record1 = AnalysisRecordDB(
            record_uuid="test-uuid-water-001",
            image_url="/uploads/images/leaf_001.jpg",
            heatmap_url="/uploads/heatmaps/gradcam_001.jpg",
            temperature=38.5,
            humidity=25.0,
            soil_moisture=0.18,
            rainfall_mm=0.0,
            aqi=65.0,
            ozone=0.038,
            growth_stage="Flowering",
            stress_severity="High",
            confidence_score=99.8,
            cnn_predictions_json=json.dumps({"healthy": 1.5, "water_stress": 92.4, "heat_stress": 4.1, "nutrient_deficiency": 1.0, "pollution": 1.0}),
            spike_counts_json=json.dumps([9, 0, 1]),
            recommendations_json=json.dumps(["[WARNING] Strong Aligned Water Stress: Schedule drip irrigation."]),
            created_at=now
        )
        self.record2 = AnalysisRecordDB(
            record_uuid="test-uuid-healthy-002",
            image_url="/uploads/images/leaf_002.jpg",
            heatmap_url=None,
            temperature=27.0,
            humidity=68.0,
            soil_moisture=0.45,
            rainfall_mm=5.0,
            aqi=45.0,
            ozone=0.030,
            growth_stage="Vegetative",
            stress_severity="Low",
            confidence_score=98.5,
            cnn_predictions_json=json.dumps({"healthy": 95.0, "water_stress": 2.0, "heat_stress": 1.0, "nutrient_deficiency": 1.0, "pollution": 1.0}),
            spike_counts_json=json.dumps([0, 9, 1]),
            recommendations_json=json.dumps(["Maintain standard scheduled irrigation routines."]),
            created_at=now
        )
        self.db.add_all([self.record1, self.record2])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_01_get_all_records(self):
        """Test retrieving all history records."""
        records = get_records(skip=0, limit=10, stress_severity=None, growth_stage=None, search=None, start_date=None, end_date=None, db=self.db)
        self.assertEqual(len(records), 2)
        uuids = [r.record_uuid for r in records]
        self.assertIn("test-uuid-water-001", uuids)
        self.assertIn("test-uuid-healthy-002", uuids)

    def test_02_filter_by_severity(self):
        """Test filtering records by SNN stress severity."""
        high_records = get_records(skip=0, limit=10, stress_severity="High", growth_stage=None, search=None, start_date=None, end_date=None, db=self.db)
        self.assertEqual(len(high_records), 1)
        self.assertEqual(high_records[0].stress_severity, "High")

        low_records = get_records(skip=0, limit=10, stress_severity="Low", growth_stage=None, search=None, start_date=None, end_date=None, db=self.db)
        self.assertEqual(len(low_records), 1)
        self.assertEqual(low_records[0].stress_severity, "Low")

    def test_03_filter_by_growth_stage(self):
        """Test filtering records by crop growth stage."""
        veg_records = get_records(skip=0, limit=10, stress_severity=None, growth_stage="Vegetative", search=None, start_date=None, end_date=None, db=self.db)
        self.assertEqual(len(veg_records), 1)
        self.assertEqual(veg_records[0].growth_stage, "Vegetative")

    def test_04_search_keyword(self):
        """Test search filter by UUID substring."""
        search_res = get_records(skip=0, limit=10, stress_severity=None, growth_stage=None, search="healthy", start_date=None, end_date=None, db=self.db)
        self.assertEqual(len(search_res), 1)
        self.assertEqual(search_res[0].record_uuid, "test-uuid-healthy-002")

    def test_05_get_single_record(self):
        """Test retrieving a single record by UUID."""
        rec = get_record(record_identifier="test-uuid-water-001", db=self.db)
        self.assertIsNotNone(rec)
        self.assertEqual(rec.record_uuid, "test-uuid-water-001")
        self.assertEqual(rec.temperature, 38.5)

    def test_06_report_html_generation(self):
        """Test report HTML generation endpoint."""
        response = get_record_report_html(record_identifier="test-uuid-water-001", db=self.db)
        self.assertEqual(response.status_code, 200)
        body = response.body.decode("utf-8")
        self.assertIn("AGROVISION — SMART COTTON FARMING", body)
        self.assertIn("test-uuid-water-001", body)
        self.assertIn("38.5 °C", body)
        self.assertIn("Decision Support Advisory", body)

    def test_07_csv_export_streaming(self):
        """Test CSV export streaming endpoint."""
        response = export_records_csv(stress_severity=None, growth_stage=None, db=self.db)
        self.assertEqual(response.media_type, "text/csv")
        csv_content = response.body.decode("utf-8")
        self.assertIn("Record UUID", csv_content)
        self.assertIn("test-uuid-water-001", csv_content)
        self.assertIn("test-uuid-healthy-002", csv_content)


if __name__ == "__main__":
    unittest.main()
