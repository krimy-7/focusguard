from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Context, DailyGoal, FocusEvent
from app.routers.insights import compute_stats
from app.schemas import SyncIn, SyncOut

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("", response_model=SyncOut)
def sync(payload: SyncIn, db: Session = Depends(get_db)):
    """Account synchronization endpoint. Mobile and desktop push lightweight
    state here; responses carry the snapshot needed to re-sync the other side."""
    if payload.event:
        if payload.event in {"intervention", "break", "beast_mode", "context_switch", "context_recovery"}:
            db.add(
                FocusEvent(
                    type=payload.event,
                    detail=str(payload.payload.get("detail", ""))[:300],
                )
            )
            db.commit()

    active = db.query(Context).filter(Context.active.is_(True)).first()
    goals = (
        db.query(DailyGoal)
        .order_by(DailyGoal.created_at.desc())
        .limit(10)
        .all()
    )
    stats = compute_stats(db)

    return SyncOut(
        status="ok",
        message=(
            f"active_context={active.title if active else 'none'}|"
            f"goals={sum(1 for g in goals)}|"
            f"score={stats.score}"
        ),
    )
