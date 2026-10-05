from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.models.db_models import Lead
from app.schemas.contact_schema import ContactRequest, ContactResponse
from app.core.database import get_db

router = APIRouter()

@router.post("/contact", response_model=ContactResponse, tags=["Contact"])
async def submit_contact(request: ContactRequest, db: Session = Depends(get_db)):
    # Simple validation is already performed by Pydantic
    lead = Lead(
        name=request.name,
        email=request.email,
        message=request.message,
    )
    db.add(lead)
    try:
        db.commit()
        db.refresh(lead)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store lead",
        ) from e
    return ContactResponse(success=True, lead_id=lead.id, detail=None)
