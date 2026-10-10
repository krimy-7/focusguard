from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Achievement, Context, FocusEvent, FocusSession
from app.routers.insights import _streak_days
from app.schemas import AchievementOut

router = APIRouter(prefix="/achievements", tags=["achievements"])

ACHIEVEMENTS = [
    {"code": "first_focus", "title": "First Focus", "description": "Complete your first focus session."},
    {"code": "first_recovery", "title": "First Context Recovery", "description": "Returned to your context after drifting."},
    {"code": "seven_day_streak", "title": "7 Day Streak", "description": "Focused 7 days in a row."},
    {"code": "deep_work", "title": "Deep Work", "description": "Logged a 50+ minute deep focus session."},
    {"code": "context_master", "title": "Context Master", "description": "Confirmed 5 different contexts."},
    {"code": "comeback", "title": "Comeback", "description": "Recovered from a distraction the same day."},
    {"code": "beast_mode", "title": "Beast Mode", "description": "Completed a Beast Mode session."},
]


@router.get("", response_model=list[AchievementOut])
def list_achievements(db: Session = Depends(get_db)):
    """Ensure all badges exist, unlock the earned ones, and return sorted by status."""
    existing = {a.code: a for a in db.query(Achievement).all()}

    for meta in ACHIEVEMENTS:
        row = existing.get(meta["code"])
        if not row:
            row = Achievement(code=meta["code"], title=meta["title"], description=meta["description"])
            db.add(row)
            existing[meta["code"]] = row
        elif not row.title:
            row.title = meta["title"]
            row.description = meta["description"]

    _unlock_earned(db, existing)
    db.commit()

    rows = db.query(Achievement).order_by(Achievement.unlocked_at.is_(None), Achievement.unlocked_at).all()
    return rows


def _unlock_earned(db: Session, existing: dict) -> None:
    now = datetime.utcnow()

    if db.query(FocusSession).count() > 0:
        _unlock(existing["first_focus"], now)
    if db.query(FocusSession).filter(FocusSession.duration_s >= 50 * 60).count() > 0:
        _unlock(existing["deep_work"], now)
    if db.query(Context).filter(Context.confirmed.is_(True)).count() >= 5:
        _unlock(existing["context_master"], now)
    if db.query(FocusEvent).filter(FocusEvent.type == "interruption").count() > 0:
        _unlock(existing["comeback"], now)
    if _streak_days(db) >= 7:
        _unlock(existing["seven_day_streak"], now)


def _unlock(achievement: Achievement, at: datetime) -> None:
    if achievement.unlocked_at is None:
        achievement.unlocked_at = at
