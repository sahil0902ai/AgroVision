import logging
import uuid
from typing import List, Optional
from datetime import datetime

try:
    from app.core.database import get_db
    from app.models.db_models import FieldDB
    from app.models.schemas import FieldCreateSchema, FieldUpdateSchema, FieldResponseSchema
except (ImportError, ModuleNotFoundError):
    from ....core.database import get_db
    from ....models.db_models import FieldDB
    from ....models.schemas import FieldCreateSchema, FieldUpdateSchema, FieldResponseSchema

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger("agrovision.fields_api")
router = APIRouter()

PRESET_FIELDS = [
    {
        "field_id": "field-a",
        "field_name": "Field A — North Parcel",
        "zone_label": "Zone 1 (Wardha / Sindi)",
        "latitude": 20.9750,
        "longitude": 78.7200,
        "crop_stage": "Flowering",
        "days_since_sowing": 60,
        "soil_type": "Deep Black Clay (Vertisol)",
        "acreage": 8.5
    },
    {
        "field_id": "field-b",
        "field_name": "Field B — South Parcel",
        "zone_label": "Zone 2 (Yavatmal)",
        "latitude": 20.4500,
        "longitude": 77.9200,
        "crop_stage": "Boll_Development",
        "days_since_sowing": 85,
        "soil_type": "Medium Black Soil",
        "acreage": 12.0
    },
    {
        "field_id": "field-c",
        "field_name": "Field C — East Plot",
        "zone_label": "Zone 3 (Nagpur Rural)",
        "latitude": 21.1458,
        "longitude": 79.0882,
        "crop_stage": "Vegetative",
        "days_since_sowing": 35,
        "soil_type": "Clay Loam",
        "acreage": 6.2
    }
]


@router.get("/fields", response_model=List[FieldResponseSchema])
def list_fields(
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    db: Session = Depends(get_db)
):
    """
    Returns the real database fields belonging to the authenticated user.
    If this is the user's first login, initializes standard registered fields.
    """
    email_key = (user_email or "default_farmer@agrovision.org").strip().lower()
    fields = db.query(FieldDB).filter(FieldDB.user_email == email_key, FieldDB.is_active == 1).all()

    if not fields:
        # Seed default fields for new user
        for pf in PRESET_FIELDS:
            new_field = FieldDB(
                field_id=f"{pf['field_id']}-{uuid.uuid4().hex[:6]}",
                user_email=email_key,
                field_name=pf["field_name"],
                zone_label=pf["zone_label"],
                latitude=pf["latitude"],
                longitude=pf["longitude"],
                crop_stage=pf["crop_stage"],
                days_since_sowing=pf["days_since_sowing"],
                soil_type=pf["soil_type"],
                acreage=pf["acreage"],
                is_active=1
            )
            db.add(new_field)
        db.commit()
        fields = db.query(FieldDB).filter(FieldDB.user_email == email_key, FieldDB.is_active == 1).all()

    return fields


@router.post("/fields", response_model=FieldResponseSchema, status_code=status.HTTP_201_CREATED)
def create_field(
    payload: FieldCreateSchema,
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Creates a new field record in the database for the user.
    """
    email_key = (user_email or "default_farmer@agrovision.org").strip().lower()
    field_id = f"field-{uuid.uuid4().hex[:8]}"

    new_field = FieldDB(
        field_id=field_id,
        user_email=email_key,
        field_name=payload.field_name,
        zone_label=payload.zone_label or "Central Cotton Zone",
        latitude=payload.latitude,
        longitude=payload.longitude,
        crop_stage=payload.crop_stage,
        days_since_sowing=payload.days_since_sowing,
        soil_type=payload.soil_type,
        acreage=payload.acreage,
        is_active=1
    )
    db.add(new_field)
    db.commit()
    db.refresh(new_field)
    return new_field


@router.put("/fields/{field_id}", response_model=FieldResponseSchema)
def update_field(
    field_id: str,
    payload: FieldUpdateSchema,
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Updates an existing field.
    """
    field = db.query(FieldDB).filter(FieldDB.field_id == field_id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found.")

    if payload.field_name is not None:
        field.field_name = payload.field_name
    if payload.zone_label is not None:
        field.zone_label = payload.zone_label
    if payload.latitude is not None:
        field.latitude = payload.latitude
    if payload.longitude is not None:
        field.longitude = payload.longitude
    if payload.crop_stage is not None:
        field.crop_stage = payload.crop_stage
    if payload.days_since_sowing is not None:
        field.days_since_sowing = payload.days_since_sowing
    if payload.soil_type is not None:
        field.soil_type = payload.soil_type
    if payload.acreage is not None:
        field.acreage = payload.acreage
    if payload.is_active is not None:
        field.is_active = payload.is_active

    field.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(field)
    return field


@router.delete("/fields/{field_id}", status_code=status.HTTP_200_OK)
def delete_field(
    field_id: str,
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Deactivates or deletes a field.
    """
    field = db.query(FieldDB).filter(FieldDB.field_id == field_id).first()
    if not field:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found.")

    field.is_active = 0
    field.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Field deleted successfully", "field_id": field_id}
