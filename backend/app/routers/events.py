from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FocusEvent
from app.schemas import EventCreate, EventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db)):
    return db.query(FocusEvent).order_by(FocusEvent.occurred_at.desc()).limit(100).all()


@router.post("", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    event = FocusEvent(
        type=payload.type,
        detail=payload.detail,
        duration_s=payload.duration_s,
        occurred_at=payload.occurred_at or datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
