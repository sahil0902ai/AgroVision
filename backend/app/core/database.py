from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from ..models.db_models import Base

DATABASE_URL = "sqlite:///./cotton_stress.db"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)
    # Safely migrate existing tables if columns are missing
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "analysis_records" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("analysis_records")]
            if "user_email" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN user_email VARCHAR"))
            if "fusion_json" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN fusion_json TEXT"))
            if "expert_veto_json" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN expert_veto_json TEXT"))
            if "field_name" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN field_name VARCHAR DEFAULT 'Field A — North Parcel'"))
            if "forecast_rainfall_mm" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN forecast_rainfall_mm FLOAT DEFAULT 0.0"))
            if "weather_source" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN weather_source VARCHAR DEFAULT 'OpenWeather'"))
            if "weather_context_json" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN weather_context_json TEXT"))
            conn.commit()

        if "chat_messages" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("chat_messages")]
            if "user_email" not in columns:
                conn.execute(text("ALTER TABLE chat_messages ADD COLUMN user_email VARCHAR"))
            conn.commit()

        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "reset_code" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN reset_code VARCHAR"))
            conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
