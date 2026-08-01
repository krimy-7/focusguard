from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FocusSession
from app.schemas import SessionCreate, SessionOut

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    return db.query(FocusSession).order_by(FocusSession.started_at.desc()).limit(100).all()


@router.post("", response_model=SessionOut, status_code=201)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    started_at = payload.started_at or datetime.utcnow()
    ended_at = payload.ended_at
    duration_s = payload.duration_s
    if ended_at is not None:
        duration_s = duration_s or max(0, (ended_at - started_at).total_seconds())

    score = 0
    if duration_s >= 25 * 60:
        score = min(100, round(duration_s / (50 * 60) * 100))
    elif duration_s >= 10 * 60:
        score = 65

    session = FocusSession(
        task_title=payload.task_title,
        app_name=payload.app_name,
        url=payload.url,
        started_at=started_at,
        ended_at=ended_at,
        duration_s=duration_s,
        score=score,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
