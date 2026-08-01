from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FocusEvent, FocusSession, Task
from app.schemas import InsightOut, StatsOut
from app.services.ai import ai_service

router = APIRouter(tags=["stats"])


def compute_stats(db: Session) -> StatsOut:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    today_sessions = (
        db.query(FocusSession).filter(FocusSession.started_at >= today_start).all()
    )
    today_events = db.query(FocusEvent).filter(FocusEvent.occurred_at >= today_start).all()

    focus_time_s = sum(s.duration_s for s in today_sessions)
    interrupts = sum(1 for e in today_events if e.type == "interruption")
    sessions = len(today_sessions)

    deep_focus_min = round(focus_time_s / 60)
    score = 0
    if sessions:
        score = round(
            min(100, (deep_focus_min / 60) * 12 + max(0, 70 - interrupts * 8))
        )

    streak_days = _streak_days(db)
    current_focus = _current_focus(db)

    return StatsOut(
        focus_time_s=round(focus_time_s, 1),
        sessions=sessions,
        interrupts=interrupts,
        deep_focus_min=deep_focus_min,
        score=score,
        streak_days=streak_days,
        current_focus=current_focus,
    )


def _streak_days(db: Session) -> int:
    last = (
        db.query(func.max(FocusSession.started_at)).scalar()
    )
    if last is None:
        return 0
    streak = 0
    day = last.replace(hour=0, minute=0, second=0, microsecond=0)
    while True:
        count = (
            db.query(func.count(FocusSession.id))
            .filter(FocusSession.started_at >= day, FocusSession.started_at < day + timedelta(days=1))
            .scalar()
        )
        if count > 0:
            streak += 1
            day -= timedelta(days=1)
        else:
            break
    return streak


def _current_focus(db: Session) -> str | None:
    active = (
        db.query(FocusSession)
        .filter(FocusSession.ended_at.is_(None))
        .order_by(FocusSession.started_at.desc())
        .first()
    )
    if active:
        return active.task_title or active.app_name
    return None


@router.get("/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    return compute_stats(db)


@router.get("/insights", response_model=InsightOut)
def get_insight(db: Session = Depends(get_db)):
    stats = compute_stats(db)
    recent_events = db.query(FocusEvent).order_by(FocusEvent.occurred_at.desc()).limit(8).all()
    open_tasks = db.query(Task).filter(Task.status != "done").limit(5).all()

    context = {
        "stats": stats.model_dump(),
        "events": [{"type": e.type, "detail": e.detail} for e in recent_events],
        "tasks": [t.title for t in open_tasks],
    }
    result = ai_service.generate_insight(context)
    return InsightOut(
        provider=ai_service.provider,
        message=result["message"],
        suggestion=result.get("suggestion"),
        generated_at=datetime.utcnow(),
    )
