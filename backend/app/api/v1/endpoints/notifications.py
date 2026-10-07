import logging
from typing import List, Optional
from datetime import datetime

try:
    from app.core.database import get_db
    from app.models.db_models import NotificationDB
    from app.models.schemas import NotificationCreateSchema, NotificationResponseSchema
except (ImportError, ModuleNotFoundError):
    from ....core.database import get_db
    from ....models.db_models import NotificationDB
    from ....models.schemas import NotificationCreateSchema, NotificationResponseSchema

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

logger = logging.getLogger("agrovision.notifications_api")
router = APIRouter()


@router.get("/notifications", response_model=List[NotificationResponseSchema])
def list_notifications(
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Returns live notifications for the user from the database.
    If none exist yet, returns initial welcome and system status notifications.
    """
    email_key = (user_email or "default_farmer@agrovision.org").strip().lower()
    notifs = (
        db.query(NotificationDB)
        .filter(NotificationDB.user_email == email_key)
        .order_by(NotificationDB.created_at.desc())
        .limit(limit)
        .all()
    )

    if not notifs:
        # Seed initial system live notification
        initial_notif = NotificationDB(
            user_email=email_key,
            title="Farm Station Connected",
            message="Live microclimate telemetry and CNN/SNN models are ready for field scans.",
            notif_type="system",
            link_url="overview.html",
            is_read=0
        )
        db.add(initial_notif)
        db.commit()
        notifs = [initial_notif]

    return notifs


@router.post("/notifications", response_model=NotificationResponseSchema, status_code=status.HTTP_201_CREATED)
def create_notification(
    payload: NotificationCreateSchema,
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Creates an event notification (e.g., when an analysis completes or alert triggers).
    """
    email_key = (user_email or "default_farmer@agrovision.org").strip().lower()
    notif = NotificationDB(
        user_email=email_key,
        title=payload.title,
        message=payload.message,
        notif_type=payload.notif_type,
        link_url=payload.link_url,
        is_read=0
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


@router.put("/notifications/read-all", status_code=status.HTTP_200_OK)
def mark_all_notifications_read(
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Marks all notifications for the user as read.
    """
    email_key = (user_email or "default_farmer@agrovision.org").strip().lower()
    db.query(NotificationDB).filter(NotificationDB.user_email == email_key).update({NotificationDB.is_read: 1})
    db.commit()
    return {"message": "All notifications marked as read"}


@router.put("/notifications/{notif_id}/read", status_code=status.HTTP_200_OK)
def mark_notification_read(
    notif_id: int,
    user_email: Optional[str] = Query(None, description="User email"),
    db: Session = Depends(get_db)
):
    """
    Marks a single notification as read.
    """
    notif = db.query(NotificationDB).filter(NotificationDB.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_read = 1
    db.commit()
    return {"message": "Notification marked as read", "id": notif_id}
