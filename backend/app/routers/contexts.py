from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Context, ContextActivity
from app.schemas import (
    ContextActivityCreate,
    ContextActivityOut,
    ContextCreate,
    ContextDetectIn,
    ContextDetectOut,
    ContextOut,
    ContextUpdate,
)
from app.services.ai import ai_service

router = APIRouter(prefix="/contexts", tags=["contexts"])


@router.get("", response_model=list[ContextOut])
def list_contexts(db: Session = Depends(get_db)):
    return (
        db.query(Context)
        .order_by(Context.active.desc(), Context.created_at.desc())
        .all()
    )


@router.get("/{context_id}", response_model=ContextOut)
def get_context(context_id: int, db: Session = Depends(get_db)):
    ctx = db.get(Context, context_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Context not found")
    return ctx


@router.post("", response_model=ContextOut, status_code=201)
def create_context(payload: ContextCreate, db: Session = Depends(get_db)):
    ctx = Context(title=payload.title, mode=payload.mode, source=payload.source, note=payload.note)
    db.add(ctx)
    db.commit()
    db.refresh(ctx)
    return ctx


@router.post("/detect", response_model=ContextDetectOut)
def detect_context(payload: ContextDetectIn, db: Session = Depends(get_db)):
    """Propose a context from desktop signals. The extension calls this when
    the current activity no longer matches the active context."""
    active = db.query(Context).filter(Context.active.is_(True)).first()
    active_context = None
    if active:
        domains = [a.domain for a in active.activities if a.domain]
        active_context = {"id": active.id, "title": active.title, "domains": domains}
    existing_contexts = [
        {"id": c.id, "title": c.title}
        for c in db.query(Context).order_by(Context.created_at.desc()).all()
    ]
    return ai_service.propose_context(
        payload.signals,
        payload.recent_domains,
        active_context=active_context,
        existing_contexts=existing_contexts,
    )


@router.patch("/{context_id}", response_model=ContextOut)
def update_context(context_id: int, payload: ContextUpdate, db: Session = Depends(get_db)):
    ctx = db.get(Context, context_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Context not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ctx, field, value)

    if payload.active is True:
        db.query(Context).filter(Context.active.is_(True), Context.id != ctx.id).update({"active": False})

    db.commit()
    db.refresh(ctx)
    return ctx


@router.post("/{context_id}/activity", response_model=ContextActivityOut, status_code=201)
def add_activity(context_id: int, payload: ContextActivityCreate, db: Session = Depends(get_db)):
    ctx = db.get(Context, context_id)
    if not ctx:
        raise HTTPException(status_code=404, detail="Context not found")
    activity = ContextActivity(
        context_id=context_id,
        kind=payload.kind,
        label=payload.label,
        domain=payload.domain,
        duration_s=payload.duration_s,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.post("/{context_id}/group", response_model=ContextActivityOut, status_code=201)
def group_activity(context_id: int, payload: ContextActivityCreate, db: Session = Depends(get_db)):
    """Group a new activity under an existing context instead of creating a new one."""
    return add_activity(context_id, payload, db)
