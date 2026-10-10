import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Index, Integer, String, TypeDecorator, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.days import utcnow

# jsonb on Postgres, JSON text on SQLite (tests/dev). Used for settings and for sites (portable text[]).
JSONType = JSON().with_variant(JSONB(), "postgresql")


class UTCDateTime(TypeDecorator):
    """Stores UTC; always returns an aware UTC datetime (SQLite would otherwise drop tzinfo)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    tz: Mapped[str] = mapped_column(String(64), default="Asia/Kathmandu", server_default="Asia/Kathmandu")
    settings: Mapped[dict] = mapped_column(JSONType, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class Goal(Base):
    __tablename__ = "goals"
    __table_args__ = (Index("ix_goals_user_day", "user_id", "day"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    day: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(8), default="open")
    sort: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    done_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class Context(Base):
    __tablename__ = "contexts"
    __table_args__ = (Index("ix_contexts_user_last_active", "user_id", "last_active_at"),)

    # Composite key: ids are extension-generated, so each user gets their own id namespace
    # (one user can never collide with, overwrite, or probe another user's context id).
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(120))
    mode: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16))
    confidence: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_active_at: Mapped[datetime] = mapped_column(UTCDateTime)
    sites: Mapped[list] = mapped_column(JSONType, default=list)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class DailyTotal(Base):
    __tablename__ = "daily_totals"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    focus_s: Mapped[int] = mapped_column(Integer, default=0)
    nudges: Mapped[int] = mapped_column(Integer, default=0)
    self_returns: Mapped[int] = mapped_column(Integer, default=0)
    recoveries: Mapped[int] = mapped_column(Integer, default=0)
    snoozes: Mapped[int] = mapped_column(Integer, default=0)
    breaks: Mapped[int] = mapped_column(Integer, default=0)
    longest_detour_s: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class DeletedUser(Base):
    """Tombstone written by DELETE /me. No personal data; kept forever so an access token that is
    still valid (up to 1 h after admin deleteUser) can never re-create the deleted account's rows."""

    __tablename__ = "deleted_users"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
