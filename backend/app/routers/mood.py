from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MoodEntry
from app.schemas import MoodIn, MoodOut

router = APIRouter(prefix="/mood", tags=["mood"])


@router.get("", response_model=list[MoodOut])
def list_mood(db: Session = Depends(get_db)):
    return db.query(MoodEntry).order_by(MoodEntry.recorded_at.desc()).limit(30).all()


@router.post("", response_model=MoodOut, status_code=201)
def log_mood(payload: MoodIn, db: Session = Depends(get_db)):
    entry = MoodEntry(mood=payload.mood, note=payload.note)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
