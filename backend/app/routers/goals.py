import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_profile
from app.database import get_db
from app.days import local_today, utcnow
from app.models import Goal, Profile
from app.schemas import GoalCreate, GoalOut, GoalPatch

router = APIRouter(prefix="/goals", tags=["goals"])


def _own_goal(db: Session, user_id: uuid.UUID, goal_id: str) -> Goal:
    # goal_id is a plain str so a malformed id is a 404 like any other unknown id, not a 422.
    try:
        gid = uuid.UUID(goal_id)
    except ValueError:
        raise HTTPException(404, "Goal not found") from None
    goal = db.scalar(select(Goal).where(Goal.id == gid, Goal.user_id == user_id))
    if goal is None:
        raise HTTPException(404, "Goal not found")
    return goal


@router.get("", response_model=list[GoalOut])
def list_goals(day: date | None = None, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    day = day or local_today(profile.tz)
    query = select(Goal).where(Goal.user_id == profile.user_id, Goal.day == day).order_by(Goal.sort, Goal.created_at)
    return db.scalars(query).all()


@router.post("", response_model=list[GoalOut], status_code=201)
def create_goals(body: GoalCreate, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    day = body.day or local_today(profile.tz)
    top = db.scalar(select(func.max(Goal.sort)).where(Goal.user_id == profile.user_id, Goal.day == day))
    first = 0 if top is None else top + 1
    goals = [
        Goal(user_id=profile.user_id, day=day, title=title, category=body.category, status="open", sort=first + i)
        for i, title in enumerate(body.titles())
    ]
    db.add_all(goals)
    db.commit()
    return goals


@router.patch("/{goal_id}", response_model=GoalOut)
def patch_goal(
    goal_id: str, body: GoalPatch, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)
):
    goal = _own_goal(db, profile.user_id, goal_id)
    changes = body.model_dump(exclude_none=True)
    if changes.get("status") == "done" and goal.status != "done":
        goal.done_at = utcnow()
    if changes.get("status") == "open":
        goal.done_at = None
    for field, value in changes.items():
        setattr(goal, field, value)
    db.commit()
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: str, profile: Profile = Depends(current_profile), db: Session = Depends(get_db)):
    db.delete(_own_goal(db, profile.user_id, goal_id))
    db.commit()
    return Response(status_code=204)
