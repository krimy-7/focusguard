import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BeastModeSession
from app.schemas import BeastModeIn, BeastModeOut

router = APIRouter(prefix="/beast", tags=["beast-mode"])


@router.get("", response_model=BeastModeOut | None)
def current_beast_mode(db: Session = Depends(get_db)):
    active = db.query(BeastModeSession).filter(BeastModeSession.active.is_(True)).first()
    return _out(active) if active else None


@router.post("", response_model=BeastModeOut, status_code=201)
def start_beast_mode(payload: BeastModeIn, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    db.query(BeastModeSession).filter(BeastModeSession.active.is_(True)).update({"active": False})
    session = BeastModeSession(
        duration_min=payload.duration_min,
        blocked_sites=json.dumps(payload.blocked_sites),
        blocked_apps=json.dumps(payload.blocked_apps),
        started_at=now,
        ends_at=now + timedelta(minutes=payload.duration_min),
        active=True,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _out(session)


@router.post("/stop", response_model=BeastModeOut | None)
def stop_beast_mode(db: Session = Depends(get_db)):
    active = db.query(BeastModeSession).filter(BeastModeSession.active.is_(True)).first()
    if not active:
        return None
    active.active = False
    active.ends_at = datetime.utcnow()
    db.commit()
    db.refresh(active)
    return _out(active)


def _out(session: BeastModeSession | None) -> BeastModeOut | None:
    if not session:
        return None
    return BeastModeOut(
        id=session.id,
        started_at=session.started_at,
        ends_at=session.ends_at,
        duration_min=session.duration_min,
        active=session.active,
        blocked_sites=json.loads(session.blocked_sites or "[]"),
        blocked_apps=json.loads(session.blocked_apps or "[]"),
    )
