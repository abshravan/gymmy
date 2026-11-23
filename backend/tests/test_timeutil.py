from datetime import date

from app.core.timeutil import add_months, local_day_bounds_utc


def test_add_months_clamps_to_month_end():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert add_months(date(2026, 11, 15), 3) == date(2027, 2, 15)
    assert add_months(date(2026, 3, 31), 12) == date(2027, 3, 31)


def test_local_day_bounds_utc_india():
    start, end = local_day_bounds_utc(date(2026, 11, 23), "Asia/Kolkata")
    assert start.isoformat() == "2026-11-22T18:30:00+00:00"
    assert end.isoformat() == "2026-11-23T18:30:00+00:00"
