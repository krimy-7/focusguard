from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import days
from app.auth import current_profile
from app.database import get_db
from app.days import day_bounds, local_today
from app.models import Context, Profile
from app.schemas import ContextSnap

router = APIRouter(prefix="/contexts", tags=["contexts"])


@router.put("/{context_id}", response_model=ContextSnap)
def put_context(
    body: ContextSnap,
    context_id: str = Path(pattern=r"^[A-Za-z0-9_-]{1,64}$"),
    profile: Profile = Depends(current_profile),
    db: Session = Depends(get_db),
):
    if body.id != context_id:
        raise HTTPException(422, "Body id must equal the id in the URL")
    row = db.get(Context, (profile.user_id, context_id))
    if row is not None and row.last_active_at > body.last_active_at:
        return row  # stale replay from an offline queue: keep the newer snapshot
    if row is None:
        row = Context(user_id=profile.user_id, id=context_id)
        db.add(row)
    for field, value in body.model_dump(exclude={"id"}).items():
        setattr(row, field, value)
    db.commit()
    return row


@router.get("", response_model=list[ContextSnap])
def list_contexts(
    day: date | None = None,
    active: bool = False,
    profile: Profile = Depends(current_profile),
    db: Session = Depends(get_db),
):
    query = select(Context).where(Context.user_id == profile.user_id)
    if active:
        latest = db.scalars(
            query.where(Context.ended_at.is_(None)).order_by(Context.last_active_at.desc()).limit(1)
        ).first()
        # R6: a context not heard from in 30 min (extension re-PUTs at least every 10) is not current.
        # days.utcnow via the module, so tests' freeze() applies.
        if latest is None or days.utcnow() - latest.last_active_at > timedelta(minutes=30):
            return []
        return [latest]
    start, end = day_bounds(day or local_today(profile.tz), profile.tz)
    # Overlaps [start, end). An unended context counts until its last activity, so an abandoned
    # one does not show up on every later day.
    overlapping = query.where(
        Context.started_at < end,
        func.coalesce(Context.ended_at, Context.last_active_at) >= start,
    ).order_by(Context.started_at)
    return db.scalars(overlapping).all()
