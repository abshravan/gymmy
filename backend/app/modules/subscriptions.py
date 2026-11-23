import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.deps import DB, Tenant, require
from app.core.errors import bad_request, conflict, not_found
from app.core.permissions import P
from app.core.timeutil import today_in
from app.models import Subscription, SubscriptionFreeze
from app.modules.billing import effective_status, net_paid_by_subscription
from app.modules.members import SubscriptionSummary, get_member, summarize
from app.modules.organizations import get_branch
from app.modules.payments import InlinePaymentIn, PaymentOut, record_payment
from app.modules.plans import get_plan, plan_end_date

router = APIRouter(tags=["subscriptions"])

Write = Annotated[Tenant, Depends(require(P.SUBSCRIPTIONS_WRITE))]


class SellIn(BaseModel):
    plan_id: uuid.UUID
    start_date: date | None = None  # defaults to today in the gym's timezone
    discount: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    branch_id: uuid.UUID | None = None  # None = valid at all branches
    payment: InlinePaymentIn | None = None


class RenewIn(BaseModel):
    plan_id: uuid.UUID | None = None  # defaults to the same plan
    start_date: date | None = None  # overrides the gym's renewal rule
    discount: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    payment: InlinePaymentIn | None = None


class FreezeIn(BaseModel):
    start_date: date | None = None  # defaults to today
    reason: str | None = Field(None, max_length=500)


class UnfreezeIn(BaseModel):
    resume_date: date | None = None  # defaults to today


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class FreezeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    start_date: date
    end_date: date | None
    days_extended: int
    reason: str | None


class SubscriptionOut(SubscriptionSummary):
    member_id: uuid.UUID
    renewed_from_id: uuid.UUID | None
    cancelled_reason: str | None
    freezes: list[FreezeOut]


class SaleOut(BaseModel):
    subscription: SubscriptionOut
    payment: PaymentOut | None


def _load(db: Session, org_id: uuid.UUID, sub_id: uuid.UUID) -> Subscription:
    s = db.scalar(
        select(Subscription)
        .where(Subscription.id == sub_id, Subscription.organization_id == org_id)
        .options(selectinload(Subscription.freezes))
        .with_for_update()
    )
    if s is None:
        raise not_found("Subscription")
    return s


def _out(db: Session, s: Subscription, today: date) -> SubscriptionOut:
    paid = net_paid_by_subscription(db, [s.id]).get(s.id, Decimal("0"))
    db.refresh(s, ["freezes"])
    return SubscriptionOut(
        **summarize(s, paid, today).model_dump(), member_id=s.member_id,
        renewed_from_id=s.renewed_from_id, cancelled_reason=s.cancelled_reason,
        freezes=[FreezeOut.model_validate(f) for f in s.freezes],
    )


def _create(db, t: Tenant, *, member, plan, start: date, discount: Decimal, branch_id,
            renewed_from_id=None) -> Subscription:
    if plan.status != "active":
        raise bad_request("This plan is archived and cannot be sold")
    if discount > plan.price:
        raise bad_request("Discount cannot exceed the plan price")
    sub = Subscription(
        organization_id=t.org_id, member_id=member.id, plan_id=plan.id, branch_id=branch_id,
        renewed_from_id=renewed_from_id, plan_name=plan.name, price=plan.price - discount,
        discount=discount, start_date=start, end_date=plan_end_date(plan, start),
        status="active", created_by=t.user.id,
    )
    db.add(sub)
    db.flush()
    return sub


def _finish_sale(db, t: Tenant, member, sub: Subscription, payment: InlinePaymentIn | None,
                 action: str) -> SaleOut:
    audit(db, org_id=t.org_id, actor_id=t.user.id, action=action, entity="subscription",
          entity_id=sub.id, data={"plan": sub.plan_name, "start": str(sub.start_date),
                                  "end": str(sub.end_date), "price": str(sub.price)})
    p = None
    if payment:
        p = record_payment(db, t, member=member, subscription=sub, amount=payment.amount,
                           method=payment.method, reference=payment.reference)
    return SaleOut(subscription=_out(db, sub, today_in(t.org.timezone)),
                   payment=PaymentOut.model_validate(p) if p else None)


@router.post("/members/{member_id}/subscriptions", response_model=SaleOut,
             status_code=status.HTTP_201_CREATED)
def sell(member_id: uuid.UUID, body: SellIn, db: DB, t: Write):
    """Sell a membership to a member, optionally recording the payment in the same step."""
    member = get_member(db, t.org_id, member_id, lock=True)
    if member.status != "active":
        raise bad_request(f"Member is {member.status}")
    plan = get_plan(db, t.org_id, body.plan_id)
    get_branch(db, t.org_id, body.branch_id)
    start = body.start_date or today_in(t.org.timezone)
    end = plan_end_date(plan, start)
    for s in member.subscriptions:
        if s.status != "cancelled" and s.start_date <= end and start <= s.end_date:
            raise conflict(
                f"Overlaps existing membership {s.plan_name} ({s.start_date} to {s.end_date}). "
                "Renew it instead."
            )
    sub = _create(db, t, member=member, plan=plan, start=start, discount=body.discount,
                  branch_id=body.branch_id)
    return _finish_sale(db, t, member, sub, body.payment, "create")


@router.get("/subscriptions/{sub_id}", response_model=SubscriptionOut)
def read_subscription(sub_id: uuid.UUID, db: DB,
                      t: Annotated[Tenant, Depends(require(P.MEMBERS_READ))]):
    return _out(db, _load(db, t.org_id, sub_id), today_in(t.org.timezone))


@router.post("/subscriptions/{sub_id}/renew", response_model=SaleOut,
             status_code=status.HTTP_201_CREATED)
def renew(sub_id: uuid.UUID, body: RenewIn, db: DB, t: Write):
    """Renewal start follows the gym's rule: `after_current` starts the day after this
    membership ends (or today if it has already ended); `immediate` starts today."""
    prev = _load(db, t.org_id, sub_id)
    if prev.status == "cancelled":
        raise bad_request("Cannot renew a cancelled subscription; sell a new one instead")
    member = get_member(db, t.org_id, prev.member_id, lock=True)
    if member.status != "active":
        raise bad_request(f"Member is {member.status}")
    if any(s.renewed_from_id == prev.id and s.status != "cancelled"
           for s in member.subscriptions):
        raise conflict("This subscription has already been renewed")
    plan = get_plan(db, t.org_id, body.plan_id or prev.plan_id)
    today = today_in(t.org.timezone)
    if body.start_date:
        start = body.start_date
    elif t.org.renewal_mode == "immediate":
        start = today
    else:
        start = max(today, prev.end_date + timedelta(days=1))
    sub = _create(db, t, member=member, plan=plan, start=start, discount=body.discount,
                  branch_id=prev.branch_id, renewed_from_id=prev.id)
    return _finish_sale(db, t, member, sub, body.payment, "renew")


@router.post("/subscriptions/{sub_id}/freeze", response_model=SubscriptionOut)
def freeze(sub_id: uuid.UUID, body: FreezeIn, db: DB, t: Write):
    s = _load(db, t.org_id, sub_id)
    today = today_in(t.org.timezone)
    if effective_status(s, today) != "active":
        raise bad_request(f"Only active memberships can be frozen (this one is "
                          f"{effective_status(s, today)})")
    start = body.start_date or today
    if not (s.start_date <= start <= s.end_date):
        raise bad_request("Freeze date must fall within the membership period")
    s.status = "frozen"
    db.add(SubscriptionFreeze(organization_id=t.org_id, subscription_id=s.id, start_date=start,
                              reason=body.reason, created_by=t.user.id))
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="freeze", entity="subscription",
          entity_id=s.id, data={"from": str(start), "reason": body.reason})
    db.flush()
    return _out(db, s, today)


@router.post("/subscriptions/{sub_id}/unfreeze", response_model=SubscriptionOut)
def unfreeze(sub_id: uuid.UUID, body: UnfreezeIn, db: DB, t: Write):
    """Ends the freeze and pushes the end date out by the days frozen, capped by the
    plan's max_freeze_days allowance across all freezes (0 = no cap)."""
    s = _load(db, t.org_id, sub_id)
    if s.status != "frozen":
        raise bad_request("Subscription is not frozen")
    open_freeze = next((f for f in s.freezes if f.end_date is None), None)
    if open_freeze is None:
        raise bad_request("No open freeze found")
    resume = body.resume_date or today_in(t.org.timezone)
    if resume < open_freeze.start_date:
        raise bad_request("Resume date is before the freeze started")
    frozen_days = (resume - open_freeze.start_date).days
    plan = get_plan(db, t.org_id, s.plan_id)
    extend = frozen_days
    if plan.max_freeze_days:
        used = sum(f.days_extended for f in s.freezes if f.id != open_freeze.id)
        extend = max(0, min(frozen_days, plan.max_freeze_days - used))
    open_freeze.end_date = resume
    open_freeze.days_extended = extend
    s.end_date = s.end_date + timedelta(days=extend)
    s.status = "active"
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="unfreeze", entity="subscription",
          entity_id=s.id, data={"frozen_days": frozen_days, "extended_days": extend,
                                "new_end": str(s.end_date)})
    return _out(db, s, today_in(t.org.timezone))


@router.post("/subscriptions/{sub_id}/cancel", response_model=SubscriptionOut)
def cancel(sub_id: uuid.UUID, body: CancelIn, db: DB,
           t: Annotated[Tenant, Depends(require(P.SUBSCRIPTIONS_CANCEL))]):
    """Cancels access. Payments are untouched; issue refunds separately if needed."""
    s = _load(db, t.org_id, sub_id)
    if s.status == "cancelled":
        raise bad_request("Subscription is already cancelled")
    s.status = "cancelled"
    s.cancelled_reason = body.reason
    for f in s.freezes:
        if f.end_date is None:
            f.end_date = today_in(t.org.timezone)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="cancel", entity="subscription",
          entity_id=s.id, data={"reason": body.reason})
    return _out(db, s, today_in(t.org.timezone))
