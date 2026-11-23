import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.deps import DB, Tenant, require
from app.core.errors import bad_request, conflict, not_found
from app.core.pagination import Page, PageParams, paginate
from app.core.permissions import P
from app.core.timeutil import local_day_bounds_utc, utcnow
from app.models import Member, Payment, Receipt, Subscription
from app.modules.billing import balance_for, net_paid_by_subscription, next_number

router = APIRouter(prefix="/payments", tags=["payments"])

Method = Literal["cash", "upi", "card", "bank_transfer"]


class PaymentIn(BaseModel):
    member_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: Method
    reference: str | None = Field(None, max_length=120)
    notes: str | None = None


class InlinePaymentIn(BaseModel):
    """Payment taken together with a sale or renewal."""
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    method: Method
    reference: str | None = Field(None, max_length=120)


class RefundIn(BaseModel):
    amount: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=2)
    reason: str = Field(min_length=3, max_length=500)


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    number: str
    amount: Decimal
    issued_at: datetime


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    member_id: uuid.UUID
    subscription_id: uuid.UUID | None
    kind: str
    refund_of_id: uuid.UUID | None
    amount: Decimal
    method: str
    reference: str | None
    notes: str | None
    status: str
    paid_at: datetime
    recorded_by: uuid.UUID | None
    receipt: ReceiptOut | None


def _load(db: Session, org_id: uuid.UUID, payment_id: uuid.UUID, lock=False) -> Payment:
    stmt = select(Payment).where(Payment.id == payment_id, Payment.organization_id == org_id)
    if lock:
        stmt = stmt.with_for_update()
    p = db.scalar(stmt.options(selectinload(Payment.receipt)))
    if p is None:
        raise not_found("Payment")
    return p


def record_payment(
    db: Session, t: Tenant, *, member: Member, subscription: Subscription | None,
    amount: Decimal, method: str, reference: str | None = None, notes: str | None = None,
    idempotency_key: str | None = None,
) -> Payment:
    if subscription is not None:
        if subscription.member_id != member.id:
            raise bad_request("Subscription does not belong to this member")
        if subscription.status == "cancelled":
            raise bad_request("Cannot take payment for a cancelled subscription")
        paid = net_paid_by_subscription(db, [subscription.id]).get(subscription.id, Decimal(0))
        due = balance_for(subscription, paid).balance_due
        if amount > due:
            raise bad_request(f"Amount exceeds balance due ({due})")
    p = Payment(
        organization_id=t.org_id, member_id=member.id,
        subscription_id=subscription.id if subscription else None, kind="payment",
        amount=amount, method=method, reference=reference, notes=notes,
        idempotency_key=idempotency_key, paid_at=utcnow(), recorded_by=t.user.id,
    )
    db.add(p)
    db.flush()
    db.add(Receipt(organization_id=t.org_id, payment_id=p.id, amount=amount,
                   number=next_number(db, t.org_id, "receipt_seq", "R", 6)))
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="create", entity="payment",
          entity_id=p.id, data={"amount": str(amount), "method": method})
    db.flush()
    db.refresh(p, ["receipt"])
    return p


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    body: PaymentIn, db: DB, response: Response,
    t: Annotated[Tenant, Depends(require(P.PAYMENTS_CREATE))],
    idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
):
    """Send an `Idempotency-Key` header so a retried request (double click, flaky
    network) returns the original payment instead of charging twice."""
    if idempotency_key:
        existing = db.scalar(select(Payment).where(
            Payment.organization_id == t.org_id, Payment.idempotency_key == idempotency_key))
        if existing:
            response.status_code = status.HTTP_200_OK
            return _load(db, t.org_id, existing.id)
    from app.modules.members import get_member  # local import avoids a cycle

    member = get_member(db, t.org_id, body.member_id)
    sub = None
    if body.subscription_id:
        sub = db.scalar(select(Subscription).where(
            Subscription.id == body.subscription_id, Subscription.organization_id == t.org_id
        ).with_for_update())
        if sub is None:
            raise not_found("Subscription")
    try:
        with db.begin_nested():
            return record_payment(
                db, t, member=member, subscription=sub, amount=body.amount, method=body.method,
                reference=body.reference, notes=body.notes, idempotency_key=idempotency_key,
            )
    except IntegrityError:
        # A concurrent request with the same key won the race.
        existing = db.scalar(select(Payment).where(
            Payment.organization_id == t.org_id, Payment.idempotency_key == idempotency_key))
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return _load(db, t.org_id, existing.id)


@router.get("", response_model=Page[PaymentOut])
def list_payments(
    db: DB, t: Annotated[Tenant, Depends(require(P.PAYMENTS_READ))],
    params: Annotated[PageParams, Depends()],
    member_id: uuid.UUID | None = None,
    subscription_id: uuid.UUID | None = None,
    method: Method | None = None,
    kind: Literal["payment", "refund"] | None = None,
    date_from: date | None = Query(None, description="Inclusive, in the gym's timezone"),
    date_to: date | None = Query(None, description="Inclusive, in the gym's timezone"),
):
    stmt = select(Payment).where(Payment.organization_id == t.org_id)
    if member_id:
        stmt = stmt.where(Payment.member_id == member_id)
    if subscription_id:
        stmt = stmt.where(Payment.subscription_id == subscription_id)
    if method:
        stmt = stmt.where(Payment.method == method)
    if kind:
        stmt = stmt.where(Payment.kind == kind)
    if date_from:
        stmt = stmt.where(Payment.paid_at >= local_day_bounds_utc(date_from, t.org.timezone)[0])
    if date_to:
        stmt = stmt.where(Payment.paid_at < local_day_bounds_utc(date_to, t.org.timezone)[1])
    stmt = stmt.options(selectinload(Payment.receipt)).order_by(Payment.paid_at.desc())
    rows, total = paginate(db, stmt, params)
    return Page(items=rows, total=total, page=params.page, page_size=params.page_size)


@router.get("/{payment_id}", response_model=PaymentOut)
def read_payment(payment_id: uuid.UUID, db: DB,
                 t: Annotated[Tenant, Depends(require(P.PAYMENTS_READ))]):
    return _load(db, t.org_id, payment_id)


@router.post("/{payment_id}/refund", response_model=PaymentOut,
             status_code=status.HTTP_201_CREATED)
def refund_payment(
    payment_id: uuid.UUID, body: RefundIn, db: DB,
    t: Annotated[Tenant, Depends(require(P.PAYMENTS_REFUND))],
):
    """Records a separate refund transaction; the original payment is never changed."""
    original = _load(db, t.org_id, payment_id, lock=True)
    if original.kind != "payment":
        raise bad_request("Only payments can be refunded")
    refunded = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.refund_of_id == original.id, Payment.status == "completed")
    )
    refundable = original.amount - Decimal(refunded)
    amount = body.amount or refundable
    if refundable <= 0:
        raise conflict("This payment has already been fully refunded")
    if amount > refundable:
        raise bad_request(f"Refund exceeds refundable amount ({refundable})")
    r = Payment(
        organization_id=t.org_id, member_id=original.member_id,
        subscription_id=original.subscription_id, kind="refund", refund_of_id=original.id,
        amount=amount, method=original.method, notes=body.reason, paid_at=utcnow(),
        recorded_by=t.user.id,
    )
    db.add(r)
    db.flush()
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="refund", entity="payment",
          entity_id=original.id,
          data={"refund_id": str(r.id), "amount": str(amount), "reason": body.reason})
    db.refresh(r, ["receipt"])
    return r
