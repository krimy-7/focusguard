from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    category: str = "should"
    tag: str = ""


class TaskUpdate(BaseModel):
    title: str | None = None
    category: str | None = None
    tag: str | None = None
    status: str | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    category: str
    tag: str
    status: str
    created_at: datetime
    completed_at: datetime | None


class SessionCreate(BaseModel):
    task_title: str = ""
    app_name: str = ""
    url: str = ""
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_s: float = 0.0


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_title: str
    app_name: str
    url: str
    started_at: datetime
    ended_at: datetime | None
    duration_s: float
    score: int


class EventCreate(BaseModel):
    type: str
    detail: str = ""
    duration_s: float = 0.0
    occurred_at: datetime | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    detail: str
    duration_s: float
    occurred_at: datetime


class StatsOut(BaseModel):
    focus_time_s: float
    sessions: int
    interrupts: int
    deep_focus_min: int
    score: int
    streak_days: int
    current_focus: str | None


class InsightOut(BaseModel):
    provider: str
    message: str
    suggestion: str | None = None
    generated_at: datetime


class ContextCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    mode: str = "work"
    source: str = "manual"
    note: str = ""


class ContextUpdate(BaseModel):
    title: str | None = None
    mode: str | None = None
    active: bool | None = None
    confirmed: bool | None = None
    note: str | None = None


class ContextActivityCreate(BaseModel):
    kind: str = "tab"
    label: str = ""
    domain: str = ""
    duration_s: float = 0.0


class ContextActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    label: str
    domain: str
    duration_s: float
    occurred_at: datetime


class ContextOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    mode: str
    source: str
    active: bool
    confirmed: bool
    note: str
    created_at: datetime
    activities: list[ContextActivityOut] = []


class ContextDetectIn(BaseModel):
    signals: dict[str, str] = {}
    recent_domains: list[str] = []


class ContextDetectOut(BaseModel):
    proposed_title: str
    mode: str
    confidence: float
    reason: str


class ExtractGoalsIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    source: str
    day: str
    created_at: datetime


class GoalUpdate(BaseModel):
    title: str | None = None
    status: str | None = None


class MoodIn(BaseModel):
    mood: str = Field(min_length=1, max_length=20)
    note: str = ""


class MoodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mood: str
    note: str
    recorded_at: datetime


class BeastModeIn(BaseModel):
    duration_min: int = Field(ge=5, le=480)
    blocked_sites: list[str] = []


class BeastModeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    ends_at: datetime | None
    duration_min: int
    active: bool
    blocked_sites: list[str]


class InterventionIn(BaseModel):
    level: int = 1
    message: str = ""
    context_id: int | None = None


class InterventionActionIn(BaseModel):
    action: str  # back_to_work | see_progress | extend_timer | take_break | dismiss


class InterventionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    level: int
    message: str
    action: str
    context_id: int | None
    occurred_at: datetime


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    title: str
    description: str
    unlocked_at: datetime | None


class BreakStateOut(BaseModel):
    on_break: bool
    context: ContextOut | None = None
    saved_progress: str = ""
    next_step: str = ""
    since: datetime | None = None


class BreakStartIn(BaseModel):
    context_id: int | None = None
    saved_progress: str = ""
    next_step: str = ""


class SyncIn(BaseModel):
    platform: str = "extension"  # extension | mobile
    event: str = ""
    payload: dict = {}


class SyncOut(BaseModel):
    status: str
    message: str = ""
