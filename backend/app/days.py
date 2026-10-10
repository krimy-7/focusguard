from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def local_today(tz: str) -> date:
    return utcnow().astimezone(ZoneInfo(tz)).date()


def day_bounds(day: date, tz: str) -> tuple[datetime, datetime]:
    """[start, end) of a local calendar day, as UTC datetimes."""
    zone = ZoneInfo(tz)
    start = datetime.combine(day, time.min, tzinfo=zone)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)
