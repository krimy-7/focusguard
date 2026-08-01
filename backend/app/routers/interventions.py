from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BreakSession, Context, InterventionLog
from app.schemas import (
    BreakStartIn,
    BreakStateOut,
    InterventionActionIn,
    InterventionIn,
    InterventionOut,
)
from app.services.ai import ai_service

router = APIRouter(tags=["interventions"])

INTERVENTION_ACTIONS = {"back_to_work", "see_progress", "extend_timer", "take_break", "dismiss"}


def _resolve_context(db: Session, context_id: int | None) -> Context | None:
    if context_id:
        return db.get(Context, context_id)
    return db.query(Context).filter(Context.active.is_(True)).first()


@router.post("/interventions", response_model=InterventionOut, status_code=201)
def trigger_intervention(payload: InterventionIn, db: Session = Depends(get_db)):
    """Log a watchdog intervention (grace period elapsed). Level 1 = first, 2 = second."""
    message = payload.message
    if not message:
        ctx = _resolve_context(db, payload.context_id)
        intent = ctx.title if ctx else "your focus"
        message = (
            f"Still on {intent}? Your attention drifted — want to come back?"
            if payload.level == 1
            else "Your focus is calling. Small steps, big wins — come back when ready."
        )
    entry = InterventionLog(
        level=max(1, min(2, payload.level)),
        message=message,
        context_id=payload.context_id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/interventions/current", response_model=InterventionOut | None)
def current_intervention(db: Session = Depends(get_db)):
    latest = (
        db.query(InterventionLog)
        .filter(InterventionLog.action == "")
        .order_by(InterventionLog.occurred_at.desc())
        .first()
    )
    return latest


@router.post("/interventions/{intervention_id}/action", response_model=InterventionOut)
def resolve_intervention(intervention_id: int, payload: InterventionActionIn, db: Session = Depends(get_db)):
    if payload.action not in INTERVENTION_ACTIONS:
        raise HTTPException(status_code=422, detail=f"Unknown action. Use one of {sorted(INTERVENTION_ACTIONS)}")
    entry = db.get(InterventionLog, intervention_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Intervention not found")
    entry.action = payload.action
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/break/start", response_model=BreakStateOut, status_code=201)
def start_break(payload: BreakStartIn, db: Session = Depends(get_db)):
    """Take a break: saves the active context + progress so returning is seamless."""
    ctx = _resolve_context(db, payload.context_id)
    active = db.query(BreakSession).filter(BreakSession.ended_at.is_(None)).first()
    if active:
        active.ended_at = datetime.utcnow()

    break_session = BreakSession(
        context_id=ctx.id if ctx else None,
        saved_progress=payload.saved_progress,
        next_step=payload.next_step,
    )
    db.add(break_session)
    if ctx:
        ctx.active = False
        db.query(Context).filter(Context.id != ctx.id, Context.active.is_(True)).update({"active": False})
    db.commit()

    return _break_state(db, break_session)


@router.get("/break", response_model=BreakStateOut)
def break_state(db: Session = Depends(get_db)):
    active = db.query(BreakSession).filter(BreakSession.ended_at.is_(None)).first()
    return _break_state(db, active)


@router.post("/break/resume", response_model=BreakStateOut)
def resume_break(db: Session = Depends(get_db)):
    active = db.query(BreakSession).filter(BreakSession.ended_at.is_(None)).first()
    if not active:
        raise HTTPException(status_code=404, detail="No active break")
    active.ended_at = datetime.utcnow()
    if active.context_id:
        ctx = db.get(Context, active.context_id)
        if ctx:
            db.query(Context).filter(Context.active.is_(True)).update({"active": False})
            ctx.active = True
    db.commit()
    return BreakStateOut(on_break=False)


def _break_state(db: Session, break_session: BreakSession | None) -> BreakStateOut:
    if not break_session:
        return BreakStateOut(on_break=False)
    context_out = None
    if break_session.context_id:
        ctx = db.get(Context, break_session.context_id)
        if ctx:
            from app.schemas import ContextOut

            context_out = ContextOut.model_validate(ctx)
    return BreakStateOut(
        on_break=True,
        context=context_out,
        saved_progress=break_session.saved_progress,
        next_step=break_session.next_step,
        since=break_session.started_at,
    )
