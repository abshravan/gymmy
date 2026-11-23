import csv
import io
import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.core.deps import DB, Tenant, require
from app.core.errors import bad_request
from app.core.money import to_money
from app.core.permissions import P
from app.core.timeutil import local_day_bounds_utc, today_in
from app.models import Attendance, Member, Payment, Subscription

router = APIRouter(tags=["dashboard & reports"])

ZERO = Decimal("0.00")


def _paid_subq(org_id):
    signed = case((Payment.kind == "refund", -Payment.amount), else_=Payment.amount)
    return (select(Payment.subscription_id.label("sid"), func.sum(signed).label("paid"))
            .where(Payment.organization_id == org_id, Payment.status == "completed",
                   Payment.subscription_id.is_not(None))
            .group_by(Payment.subscription_id).subquery())


def _active_on(org_id, day: date):
    return and_(Subscription.organization_id == org_id, Subscription.status == "active",
                Subscription.start_date <= day, Subscription.end_date >= day)


def _net_collected(db: Session, org_id, start, end) -> Decimal:
    signed = case((Payment.kind == "refund", -Payment.amount), else_=Payment.amount)
    return to_money(db.scalar(
        select(func.coalesce(func.sum(signed), 0)).where(
            Payment.organization_id == org_id, Payment.status == "completed",
            Payment.paid_at >= start, Payment.paid_at < end)))


def _range(t: Tenant, date_from: date | None, date_to: date | None) -> tuple[date, date]:
    today = today_in(t.org.timezone)
    df, dt = date_from or today.replace(day=1), date_to or today
    if df > dt:
        raise bad_request("date_from must be on or before date_to")
    if (dt - df).days > 366:
        raise bad_request("Date range cannot exceed one year")
    return df, dt


def _by_local_day(rows, tz: str) -> dict[date, list]:
    """Group (timestamp, *values) rows by calendar day in the gym's timezone. Done in
    Python so it works the same on PostgreSQL and SQLite."""
    zone = ZoneInfo(tz)
    days: dict[date, list] = defaultdict(list)
    for ts, *rest in rows:
        days[ts.astimezone(zone).date()].append(rest)
    return dict(sorted(days.items()))


# ---------------------------------------------------------------- dashboard

class ExpiringItem(BaseModel):
    subscription_id: uuid.UUID
    member_id: uuid.UUID
    member_number: str
    member_name: str
    phone: str
    plan_name: str
    end_date: date
    balance_due: Decimal


class DashboardSummary(BaseModel):
    date: date
    currency: str
    active_members: int
    frozen_members: int
    total_members: int
    new_members_this_month: int
    checkins_today: int
    collections_today: Decimal
    collections_this_month: Decimal
    outstanding_dues: Decimal
    expiring_next_7_days: int
    expiring_soon: list[ExpiringItem]


def _expiring(db: Session, t: Tenant, start: date, end: date, limit: int | None = None):
    paid = _paid_subq(t.org_id)
    renewed = select(Subscription.renewed_from_id).where(
        Subscription.organization_id == t.org_id, Subscription.status != "cancelled",
        Subscription.renewed_from_id.is_not(None))
    stmt = (
        select(Subscription, Member, func.coalesce(paid.c.paid, 0))
        .join(Member, Member.id == Subscription.member_id)
        .outerjoin(paid, paid.c.sid == Subscription.id)
        .where(Subscription.organization_id == t.org_id, Subscription.status == "active",
               Subscription.end_date >= start, Subscription.end_date <= end,
               Member.status == "active", Subscription.id.not_in(renewed))
        .order_by(Subscription.end_date, Member.first_name)
    )
    if limit:
        stmt = stmt.limit(limit)
    return [
        ExpiringItem(subscription_id=s.id, member_id=m.id, member_number=m.member_number,
                     member_name=f"{m.first_name} {m.last_name or ''}".strip(), phone=m.phone,
                     plan_name=s.plan_name, end_date=s.end_date,
                     balance_due=max(s.price - to_money(p), ZERO))
        for s, m, p in db.execute(stmt).all()
    ]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard(db: DB, t: Annotated[Tenant, Depends(require(P.DASHBOARD_READ))]):
    tz, org_id = t.org.timezone, t.org_id
    today = today_in(tz)
    day_start, day_end = local_day_bounds_utc(today, tz)
    month_start = local_day_bounds_utc(today.replace(day=1), tz)[0]

    active = db.scalar(select(func.count(func.distinct(Subscription.member_id)))
                       .join(Member, Member.id == Subscription.member_id)
                       .where(_active_on(org_id, today), Member.status == "active")) or 0
    frozen = db.scalar(select(func.count(func.distinct(Subscription.member_id))).where(
        Subscription.organization_id == org_id, Subscription.status == "frozen")) or 0
    total = db.scalar(select(func.count()).select_from(Member).where(
        Member.organization_id == org_id, Member.status != "inactive")) or 0
    new = db.scalar(select(func.count()).select_from(Member).where(
        Member.organization_id == org_id, Member.created_at >= month_start)) or 0
    checkins = db.scalar(select(func.count()).select_from(Attendance).where(
        Attendance.organization_id == org_id, Attendance.check_in_at >= day_start,
        Attendance.check_in_at < day_end)) or 0

    paid = _paid_subq(org_id)
    owed = Subscription.price - func.coalesce(paid.c.paid, 0)
    dues = db.scalar(
        select(func.coalesce(func.sum(case((owed > 0, owed), else_=0)), 0))
        .outerjoin(paid, paid.c.sid == Subscription.id)
        .where(Subscription.organization_id == org_id, Subscription.status != "cancelled")
    )
    expiring = _expiring(db, t, today, today + timedelta(days=7))
    return DashboardSummary(
        date=today, currency=t.org.currency, active_members=active, frozen_members=frozen,
        total_members=total, new_members_this_month=new, checkins_today=checkins,
        collections_today=_net_collected(db, org_id, day_start, day_end),
        collections_this_month=_net_collected(db, org_id, month_start, day_end),
        outstanding_dues=to_money(dues), expiring_next_7_days=len(expiring),
        expiring_soon=expiring[:10],
    )


# ---------------------------------------------------------------- reports

def _csv(rows: list[dict], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


Reports = Annotated[Tenant, Depends(require(P.REPORTS_READ))]


@router.get("/reports/expiring", response_model=list[ExpiringItem])
def expiring_report(db: DB, t: Reports, days: int = Query(7, ge=0, le=90),
                    format: str = Query("json", pattern="^(json|csv)$")):
    today = today_in(t.org.timezone)
    items = _expiring(db, t, today, today + timedelta(days=days))
    if format == "csv":
        return _csv([i.model_dump(mode="json") for i in items], "expiring-memberships.csv")
    return items


class DueItem(BaseModel):
    subscription_id: uuid.UUID
    member_id: uuid.UUID
    member_number: str
    member_name: str
    phone: str
    plan_name: str
    start_date: date
    end_date: date
    price: Decimal
    amount_paid: Decimal
    balance_due: Decimal


@router.get("/reports/dues", response_model=list[DueItem])
def dues_report(db: DB, t: Reports, format: str = Query("json", pattern="^(json|csv)$")):
    paid = _paid_subq(t.org_id)
    p = func.coalesce(paid.c.paid, 0)
    rows = db.execute(
        select(Subscription, Member, p).join(Member, Member.id == Subscription.member_id)
        .outerjoin(paid, paid.c.sid == Subscription.id)
        .where(Subscription.organization_id == t.org_id, Subscription.status != "cancelled",
               Subscription.price > p)
        .order_by(Subscription.start_date)
    ).all()
    items = [DueItem(subscription_id=s.id, member_id=m.id, member_number=m.member_number,
                     member_name=f"{m.first_name} {m.last_name or ''}".strip(), phone=m.phone,
                     plan_name=s.plan_name, start_date=s.start_date, end_date=s.end_date,
                     price=s.price, amount_paid=to_money(pd), balance_due=s.price - to_money(pd))
             for s, m, pd in rows]
    if format == "csv":
        return _csv([i.model_dump(mode="json") for i in items], "outstanding-dues.csv")
    return items


class DayCount(BaseModel):
    date: date
    count: int


class AttendanceReport(BaseModel):
    date_from: date
    date_to: date
    total_checkins: int
    unique_members: int
    by_day: list[DayCount]


@router.get("/reports/attendance", response_model=AttendanceReport)
def attendance_report(db: DB, t: Reports, date_from: date | None = None,
                      date_to: date | None = None):
    df, dt = _range(t, date_from, date_to)
    tz = t.org.timezone
    start, end = local_day_bounds_utc(df, tz)[0], local_day_bounds_utc(dt, tz)[1]
    where = (Attendance.organization_id == t.org_id, Attendance.check_in_at >= start,
             Attendance.check_in_at < end)
    days = _by_local_day(db.execute(select(Attendance.check_in_at).where(*where)).all(), tz)
    unique = db.scalar(select(func.count(func.distinct(Attendance.member_id))).where(*where))
    return AttendanceReport(date_from=df, date_to=dt, total_checkins=sum(len(v) for v in days.values()),
                            unique_members=unique or 0,
                            by_day=[DayCount(date=d, count=len(v)) for d, v in days.items()])


class MethodTotal(BaseModel):
    method: str
    collected: Decimal
    refunded: Decimal
    net: Decimal


class DayAmount(BaseModel):
    date: date
    net: Decimal


class RevenueReport(BaseModel):
    date_from: date
    date_to: date
    currency: str
    collected: Decimal
    refunded: Decimal
    net: Decimal
    payment_count: int
    by_method: list[MethodTotal]
    by_day: list[DayAmount]


@router.get("/reports/revenue", response_model=RevenueReport)
def revenue_report(db: DB, t: Reports, date_from: date | None = None,
                   date_to: date | None = None):
    df, dt = _range(t, date_from, date_to)
    tz = t.org.timezone
    start, end = local_day_bounds_utc(df, tz)[0], local_day_bounds_utc(dt, tz)[1]
    where = (Payment.organization_id == t.org_id, Payment.status == "completed",
             Payment.paid_at >= start, Payment.paid_at < end)
    pay = func.coalesce(func.sum(case((Payment.kind == "payment", Payment.amount), else_=0)), 0)
    ref = func.coalesce(func.sum(case((Payment.kind == "refund", Payment.amount), else_=0)), 0)
    cnt = func.count(case((Payment.kind == "payment", 1)))
    methods = db.execute(select(Payment.method, pay, ref).where(*where)
                         .group_by(Payment.method).order_by(Payment.method)).all()
    signed = case((Payment.kind == "refund", -Payment.amount), else_=Payment.amount)
    days = _by_local_day(db.execute(select(Payment.paid_at, signed).where(*where)).all(), tz)
    count = db.scalar(select(cnt).where(*where)) or 0
    collected = sum((to_money(p) for _, p, _ in methods), ZERO)
    refunded = sum((to_money(r) for _, _, r in methods), ZERO)
    return RevenueReport(
        date_from=df, date_to=dt, currency=t.org.currency, collected=collected,
        refunded=refunded, net=collected - refunded, payment_count=count,
        by_method=[MethodTotal(method=m, collected=to_money(p), refunded=to_money(r),
                               net=to_money(p) - to_money(r)) for m, p, r in methods],
        by_day=[DayAmount(date=d, net=sum((to_money(v) for (v,) in vals), ZERO)) for d, vals in days.items()],
    )
