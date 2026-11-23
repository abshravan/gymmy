import calendar
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo


def utcnow() -> datetime:
    return datetime.now(UTC)


def today_in(tz: str) -> date:
    return datetime.now(ZoneInfo(tz)).date()


def local_day_bounds_utc(day: date, tz: str) -> tuple[datetime, datetime]:
    """UTC [start, end) of a calendar day in the gym's timezone."""
    z = ZoneInfo(tz)
    start = datetime(day.year, day.month, day.day, tzinfo=z)
    end = start + timedelta(days=1)
    return start.astimezone(UTC), end.astimezone(UTC)


def add_months(d: date, months: int) -> date:
    """Calendar month addition, clamping to month end (Jan 31 + 1 month = Feb 28/29)."""
    m = d.month - 1 + months
    year, month = d.year + m // 12, m % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
