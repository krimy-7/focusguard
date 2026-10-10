from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DailyGoal
from app.schemas import ExtractGoalsIn, GoalOut, GoalUpdate
from app.services.ai import ai_service

router = APIRouter(prefix="/planning", tags=["planning"])


def today_key() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


@router.post("/extract", response_model=list[GoalOut])
def extract_goals(payload: ExtractGoalsIn, db: Session = Depends(get_db)):
    """Turn a morning intention into structured goals via AI (mock fallback)."""
    extracted = ai_service.extract_goals(payload.text)
    goals = []
    for item in extracted:
        goal = DailyGoal(title=item["title"], source=item.get("source", "ai"), day=today_key())
        db.add(goal)
        goals.append(goal)
    db.commit()
    for g in goals:
        db.refresh(g)
    return goals


@router.post("/extract/audio", response_model=list[GoalOut])
def extract_goals_from_audio(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Turn a voice note into a day plan via audio transcription and AI extraction."""
    audio_bytes = file.file.read()
    transcript = ai_service.transcribe_audio(audio_bytes, file.filename, file.content_type or "audio/wav")
    if not transcript.strip():
        raise HTTPException(status_code=503, detail="Transcription unavailable — type your plan instead.")
    extracted = ai_service.extract_goals(transcript)
    goals = []
    for item in extracted:
        goal = DailyGoal(title=item["title"], source=item.get("source", "ai"), day=today_key())
        db.add(goal)
        goals.append(goal)
    db.commit()
    for g in goals:
        db.refresh(g)
    return goals


@router.get("/goals", response_model=list[GoalOut])
def list_goals(day: str | None = None, db: Session = Depends(get_db)):
    query = db.query(DailyGoal)
    if day:
        query = query.filter(DailyGoal.day == day)
    return query.order_by(DailyGoal.created_at.desc()).all()


@router.patch("/goals/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, payload: GoalUpdate, db: Session = Depends(get_db)):
    goal = db.get(DailyGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.get(DailyGoal, goal_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(goal)
    db.commit()
