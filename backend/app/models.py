from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="should", index=True)
    tag: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_title: Mapped[str] = mapped_column(String(300), default="", index=True)
    app_name: Mapped[str] = mapped_column(String(120), default="")
    url: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_s: Mapped[float] = mapped_column(Float, default=0.0)
    score: Mapped[int] = mapped_column(Integer, default=0)


class FocusEvent(Base):
    __tablename__ = "focus_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    detail: Mapped[str] = mapped_column(String(300), default="")
    duration_s: Mapped[float] = mapped_column(Float, default=0.0)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    achieved: Mapped[bool] = mapped_column(Boolean, default=False)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Context(Base):
    """An intended focus context (e.g. 'Landing Page Design') the user works within."""

    __tablename__ = "contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(20), default="work")  # learning | work | personal
    source: Mapped[str] = mapped_column(String(40), default="detected")  # detected | manual | planning
    active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    activities: Mapped[list["ContextActivity"]] = relationship(
        back_populates="context", cascade="all, delete-orphan", order_by="ContextActivity.occurred_at.desc()"
    )


class ContextActivity(Base):
    """A single observed signal (tab/domain/app) grouped under a context."""

    __tablename__ = "context_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int] = mapped_column(ForeignKey("contexts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="tab")  # tab | domain | app
    label: Mapped[str] = mapped_column(String(200), default="")
    domain: Mapped[str] = mapped_column(String(200), default="")
    duration_s: Mapped[float] = mapped_column(Float, default=0.0)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    context: Mapped[Context] = relationship(back_populates="activities")


class DailyGoal(Base):
    """A structured goal produced during morning planning."""

    __tablename__ = "daily_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open | in_progress | done
    source: Mapped[str] = mapped_column(String(20), default="ai")  # ai | manual
    day: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MoodEntry(Base):
    """Quick mood capture (single emoji + optional note)."""

    __tablename__ = "mood_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mood: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str] = mapped_column(String(200), default="")
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class BeastModeSession(Base):
    """Explicit high-focus mode blocking selected sites/apps for a duration."""

    __tablename__ = "beast_mode_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    blocked_sites: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of domains
    blocked_apps: Mapped[str] = mapped_column(Text, default="[]")  # JSON list of Android package names


class InterventionLog(Base):
    """A record of a watchdog intervention and the user's response."""

    __tablename__ = "intervention_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    message: Mapped[str] = mapped_column(Text, default="")
    action: Mapped[str] = mapped_column(String(30), default="")
    # back_to_work | see_progress | extend_timer | take_break | dismiss
    context_id: Mapped[int | None] = mapped_column(ForeignKey("contexts.id"), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class Achievement(Base):
    """Badges rewarding positive behaviour (first focus, streaks, recoveries...)."""

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class BreakSession(Base):
    """Saved state while the user is on a break, preserving context continuity."""

    __tablename__ = "break_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    context_id: Mapped[int | None] = mapped_column(ForeignKey("contexts.id"), nullable=True)
    saved_progress: Mapped[str] = mapped_column(Text, default="")
    next_step: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
