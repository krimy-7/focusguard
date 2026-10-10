import re
import uuid
from datetime import date, datetime
from functools import lru_cache
from typing import Annotated, Literal
from zoneinfo import available_timezones

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator


class Strict(BaseModel):
    """Request bodies: unknown fields are a 422, so nothing unexpected (titles, URLs) is ever stored."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)


# ---------- profile ----------


@lru_cache
def _zones() -> frozenset[str]:
    return frozenset(available_timezones())  # needs the tzdata package on Windows


def _iana_tz(value: str) -> str:
    if value not in _zones():
        raise ValueError("must be an IANA timezone like Asia/Kathmandu")
    return value


IanaTz = Annotated[str, AfterValidator(_iana_tz)]
HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class QuietHours(Strict):
    from_: Annotated[str, Field(alias="from", pattern=HHMM)]
    to: Annotated[str, Field(pattern=HHMM)]


class SettingsPatch(Strict):
    grace_s: int | None = Field(default=None, ge=120, le=900)
    quiet_hours: list[QuietHours] | None = Field(default=None, max_length=3)


class ProfilePatch(Strict):
    tz: IanaTz | None = None
    settings: SettingsPatch | None = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    tz: str
    settings: dict


# ---------- goals ----------

Category = Literal["work", "learning", "personal"]
Title200 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


def split_lines(text: str) -> list[str]:
    r"""'a\n\n  b, c \r\n' -> ['a', 'b, c']: one goal per line, trimmed, empties dropped.

    Splits on \r\n, \r and \n only (R3, same as the dashboard's /\r\n|\r|\n/); str.splitlines()
    would also split on \v, \f, U+2028, ... and create more goals than the preview showed."""
    return [s for s in (line.strip() for line in re.split(r"\r\n|\r|\n", text)) if s]


class GoalCreate(Strict):
    title: Title200 | None = None
    lines: str | None = Field(default=None, max_length=5000)
    category: Category = "work"
    day: date | None = None

    @model_validator(mode="after")
    def _one_source(self):
        if (self.title is None) == (self.lines is None):
            raise ValueError("send exactly one of title or lines")
        titles = self.titles()
        if not titles:
            raise ValueError("lines contains no goals")
        if len(titles) > 20:
            raise ValueError("at most 20 goals at once")
        if any(len(t) > 200 for t in titles):
            raise ValueError("each goal is at most 200 characters")
        return self

    def titles(self) -> list[str]:
        return [self.title] if self.title is not None else split_lines(self.lines)


class GoalPatch(Strict):
    title: Title200 | None = None
    status: Literal["open", "done"] | None = None
    sort: int | None = Field(default=None, ge=0, le=1_000_000)
    category: Category | None = None


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    day: date
    title: str
    category: Category
    status: Literal["open", "done"]
    sort: int
    created_at: datetime
    done_at: datetime | None


# ---------- contexts ----------

Mode = Literal["work", "learning", "personal"]
State = Literal["detected", "active", "grace", "intervened_l1", "escalated_l2", "on_break", "ended"]
Confidence = Literal["inferred", "confirmed"]
Title120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ClientId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]  # extension-generated ids

# Everything URL.hostname can yield for an http(s) tab: DNS labels (WHATWG allows '_'), IPv4, or a
# bracketed IPv6 literal like [::1]. One rejected host would 422 the whole snapshot (and block D's sync).
_LABEL = r"[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?"
_HOST_RE = re.compile(rf"(?=.{{1,253}}$){_LABEL}(\.{_LABEL})*|\[[0-9a-f:.]{{2,45}}\]")


def _hostname(value: str) -> str:
    value = value.strip().lower()
    if not _HOST_RE.fullmatch(value):
        raise ValueError("must be a bare hostname like docs.python.org (no scheme, path or port)")
    return value


Hostname = Annotated[str, AfterValidator(_hostname)]


class ContextSnap(Strict):
    id: ClientId
    device_id: ClientId
    title: Title120
    mode: Mode
    state: State
    confidence: Confidence
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    last_active_at: AwareDatetime
    sites: list[Hostname] = Field(default_factory=list, max_length=50)


# ---------- daily totals ----------

Seconds = Annotated[int, Field(ge=0, le=90_000)]  # a local day is at most 25 h (DST)
Count = Annotated[int, Field(ge=0, le=100_000)]
COUNTERS = ("focus_s", "nudges", "self_returns", "recoveries", "snoozes", "breaks", "longest_detour_s")


class DailyCounts(Strict):
    day: date
    focus_s: Seconds
    nudges: Count
    self_returns: Count
    recoveries: Count
    snoozes: Count
    breaks: Count
    longest_detour_s: Seconds


class DailyTotals(DailyCounts):
    device_id: ClientId


class DailySum(BaseModel):
    """GET /daily item: sums across devices, so the per-device caps above do not apply."""

    day: date
    focus_s: int
    nudges: int
    self_returns: int
    recoveries: int
    snoozes: int
    breaks: int
    longest_detour_s: int


# ---------- export ----------


class Export(BaseModel):
    profile: ProfileOut
    goals: list[GoalOut]
    contexts: list[ContextSnap]
    daily: list[DailyTotals]
