from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_profile
from app.database import get_db
from app.models import DailyTotal, Profile
from app.schemas import COUNTERS, DailySum, DailyTotals

router = APIRouter(prefix="/daily", tags=["daily"])


@router.put("/{day}", response_model=DailyTotals)
def put_daily(day: date, body: DailyTotals, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    if body.day != day:
        raise HTTPException(422, "Body day must equal the day in the URL")
    row = db.get(DailyTotal, (profile.user_id, day, body.device_id))
    if row is None:
        row = DailyTotal(user_id=profile.user_id, day=day, device_id=body.device_id)
        db.add(row)
    for field in COUNTERS:  # absolute values: last write wins, so retries never double-count
        setattr(row, field, getattr(body, field))
    db.commit()
    return row


@router.get("", response_model=list[DailySum])
def get_daily(
    from_: date = Query(alias="from"),
    to: date = Query(),
    profile: Profile = Depends(current_profile),
    db: Session = Depends(get_db),
):
    if to < from_ or (to - from_).days >= 31:
        raise HTTPException(422, "from must be <= to and the range at most 31 days")
    sums = [func.sum(getattr(DailyTotal, f)).label(f) for f in COUNTERS if f != "longest_detour_s"]
    query = (
        select(DailyTotal.day, *sums, func.max(DailyTotal.longest_detour_s).label("longest_detour_s"))
        .where(DailyTotal.user_id == profile.user_id, DailyTotal.day >= from_, DailyTotal.day <= to)
        .group_by(DailyTotal.day)
        .order_by(DailyTotal.day)
    )
    return [row._asdict() for row in db.execute(query)]
