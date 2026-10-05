from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from app.models.db_models import Base

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
            if "fusion_json" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN fusion_json TEXT"))
                conn.commit()
            if "expert_veto_json" not in columns:
                conn.execute(text("ALTER TABLE analysis_records ADD COLUMN expert_veto_json TEXT"))
                conn.commit()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

