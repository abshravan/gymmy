"""Shared membership and balance logic used by members, subscriptions, payments,
attendance and reports."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Organization, Payment, Subscription

ZERO = Decimal("0.00")


def effective_status(sub: Subscription, today: date) -> str:
    """active | frozen | cancelled | upcoming | expired"""
    if sub.status in ("cancelled", "frozen"):
        return sub.status
    if today < sub.start_date:
        return "upcoming"
    if today > sub.end_date:
        return "expired"
    return "active"


def current_subscription(subs: list[Subscription], today: date) -> Subscription | None:
    """The subscription that governs access today, else the most relevant other one:
    active > frozen > next upcoming > most recently ended."""
    live = [s for s in subs if s.status != "cancelled"]
    by_status: dict[str, list[Subscription]] = {}
    for s in live:
        by_status.setdefault(effective_status(s, today), []).append(s)
    if by_status.get("active"):
        return max(by_status["active"], key=lambda s: s.end_date)
    if by_status.get("frozen"):
        return max(by_status["frozen"], key=lambda s: s.end_date)
    if by_status.get("upcoming"):
        return min(by_status["upcoming"], key=lambda s: s.start_date)
    return max(live, key=lambda s: s.end_date) if live else None


def net_paid_by_subscription(db: Session, sub_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    if not sub_ids:
        return {}
    signed = case((Payment.kind == "refund", -Payment.amount), else_=Payment.amount)
    rows = db.execute(
        select(Payment.subscription_id, func.coalesce(func.sum(signed), 0))
        .where(Payment.subscription_id.in_(sub_ids), Payment.status == "completed")
        .group_by(Payment.subscription_id)
    ).all()
    return {sid: Decimal(total) for sid, total in rows}


@dataclass
class Balance:
    amount_paid: Decimal
    balance_due: Decimal
    payment_status: str  # paid | partial | unpaid


def balance_for(sub: Subscription, paid: Decimal) -> Balance:
    due = max(sub.price - paid, ZERO)
    if due == 0:
        st = "paid"
    elif paid > 0:
        st = "partial"
    else:
        st = "unpaid"
    return Balance(amount_paid=paid, balance_due=due, payment_status=st)


def next_number(db: Session, org_id: uuid.UUID, field: str, prefix: str, width: int) -> str:
    """Per-gym sequential numbers (member numbers, receipt numbers). The row lock keeps
    concurrent requests from receiving the same number."""
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    value = getattr(org, field) + 1
    setattr(org, field, value)
    return f"{prefix}{value:0{width}d}"
