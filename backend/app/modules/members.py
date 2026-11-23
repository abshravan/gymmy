import secrets
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.deps import DB, Tenant, require
from app.core.errors import conflict, not_found
from app.core.pagination import Page, PageParams, paginate
from app.core.permissions import P
from app.core.timeutil import today_in
from app.models import Member, Subscription
from app.modules.billing import (
    balance_for,
    current_subscription,
    effective_status,
    net_paid_by_subscription,
    next_number,
)

router = APIRouter(prefix="/members", tags=["members"])

Read = Annotated[Tenant, Depends(require(P.MEMBERS_READ))]
Write = Annotated[Tenant, Depends(require(P.MEMBERS_WRITE))]


def normalize_phone(phone: str) -> str:
    keep = "".join(ch for ch in phone if ch.isdigit() or ch == "+")
    return keep or phone.strip()


class MemberBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    phone: str = Field(min_length=5, max_length=40)
    email: EmailStr | None = None
    gender: str | None = Field(None, max_length=20)
    date_of_birth: date | None = None
    address: str | None = None
    emergency_contact_name: str | None = Field(None, max_length=200)
    emergency_contact_phone: str | None = Field(None, max_length=40)
    notes: str | None = None


class MemberCreate(MemberBase):
    # Set to true after the user has seen the duplicate warning and confirmed.
    allow_duplicate_phone: bool = False


class MemberUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    phone: str | None = Field(None, min_length=5, max_length=40)
    email: EmailStr | None = None
    gender: str | None = Field(None, max_length=20)
    date_of_birth: date | None = None
    address: str | None = None
    emergency_contact_name: str | None = Field(None, max_length=200)
    emergency_contact_phone: str | None = Field(None, max_length=40)
    notes: str | None = None
    status: Literal["active", "suspended", "inactive"] | None = None


class SubscriptionSummary(BaseModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    plan_name: str
    branch_id: uuid.UUID | None
    start_date: date
    end_date: date
    price: Decimal
    discount: Decimal
    status: str  # effective status
    amount_paid: Decimal
    balance_due: Decimal
    payment_status: str


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    member_number: str
    first_name: str
    last_name: str | None
    full_name: str
    phone: str
    email: str | None
    status: str
    membership_status: str  # active | frozen | upcoming | expired | none
    membership_end_date: date | None
    created_at: datetime


class MemberDetail(MemberOut):
    gender: str | None
    date_of_birth: date | None
    address: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    notes: str | None
    qr_token: str
    current_subscription: SubscriptionSummary | None
    subscriptions: list[SubscriptionSummary]
    total_balance_due: Decimal


class DuplicateOut(BaseModel):
    id: uuid.UUID
    member_number: str
    full_name: str
    phone: str


def full_name(m: Member) -> str:
    return f"{m.first_name} {m.last_name}".strip() if m.last_name else m.first_name


def summarize(sub: Subscription, paid: Decimal, today: date) -> SubscriptionSummary:
    b = balance_for(sub, paid)
    return SubscriptionSummary(
        id=sub.id, plan_id=sub.plan_id, plan_name=sub.plan_name, branch_id=sub.branch_id,
        start_date=sub.start_date, end_date=sub.end_date, price=sub.price, discount=sub.discount,
        status=effective_status(sub, today), amount_paid=b.amount_paid,
        balance_due=b.balance_due, payment_status=b.payment_status,
    )


def member_out(m: Member, today: date) -> MemberOut:
    cur = current_subscription(list(m.subscriptions), today)
    return MemberOut(
        id=m.id, member_number=m.member_number, first_name=m.first_name, last_name=m.last_name,
        full_name=full_name(m), phone=m.phone, email=m.email, status=m.status,
        membership_status=effective_status(cur, today) if cur else "none",
        membership_end_date=cur.end_date if cur else None, created_at=m.created_at,
    )


def member_detail(db: Session, m: Member, today: date) -> MemberDetail:
    subs = list(m.subscriptions)
    paid = net_paid_by_subscription(db, [s.id for s in subs])
    summaries = [summarize(s, paid.get(s.id, Decimal("0")), today) for s in subs]
    cur = current_subscription(subs, today)
    base = member_out(m, today).model_dump()
    return MemberDetail(
        **base,
        gender=m.gender, date_of_birth=m.date_of_birth, address=m.address,
        emergency_contact_name=m.emergency_contact_name,
        emergency_contact_phone=m.emergency_contact_phone, notes=m.notes, qr_token=m.qr_token,
        current_subscription=next((s for s in summaries if cur and s.id == cur.id), None),
        subscriptions=summaries,
        total_balance_due=sum(
            (s.balance_due for s in summaries if s.status != "cancelled"), Decimal("0")
        ),
    )


def get_member(db: Session, org_id: uuid.UUID, member_id: uuid.UUID, lock=False) -> Member:
    stmt = select(Member).where(Member.id == member_id, Member.organization_id == org_id)
    if lock:
        stmt = stmt.with_for_update()
    m = db.scalar(stmt.options(selectinload(Member.subscriptions)))
    if m is None:
        raise not_found("Member")
    return m


def find_by_phone(db: Session, org_id: uuid.UUID, phone: str) -> list[Member]:
    return list(db.scalars(
        select(Member).where(Member.organization_id == org_id,
                             Member.phone == normalize_phone(phone))
    ))


@router.get("", response_model=Page[MemberOut])
def list_members(
    db: DB, t: Read, params: Annotated[PageParams, Depends()],
    q: str | None = Query(None, description="Name, phone, email or member number"),
    status_: Annotated[str | None, Query(alias="status")] = None,
):
    stmt = select(Member).where(Member.organization_id == t.org_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            Member.first_name.ilike(like), Member.last_name.ilike(like),
            (Member.first_name + " " + Member.last_name).ilike(like),
            Member.phone.ilike(f"%{normalize_phone(q)}%"), Member.email.ilike(like),
            Member.member_number.ilike(like),
        ))
    if status_:
        stmt = stmt.where(Member.status == status_)
    stmt = stmt.options(selectinload(Member.subscriptions)).order_by(Member.created_at.desc())
    rows, total = paginate(db, stmt, params)
    today = today_in(t.org.timezone)
    return Page(items=[member_out(m, today) for m in rows], total=total,
                page=params.page, page_size=params.page_size)


@router.get("/duplicates", response_model=list[DuplicateOut])
def check_duplicates(db: DB, t: Read, phone: str = Query(min_length=3)):
    return [DuplicateOut(id=m.id, member_number=m.member_number, full_name=full_name(m),
                         phone=m.phone) for m in find_by_phone(db, t.org_id, phone)]


@router.post("", response_model=MemberDetail, status_code=status.HTTP_201_CREATED)
def create_member(body: MemberCreate, db: DB, t: Write):
    data = body.model_dump(exclude={"allow_duplicate_phone"})
    data["phone"] = normalize_phone(data["phone"])
    if not body.allow_duplicate_phone and (dups := find_by_phone(db, t.org_id, data["phone"])):
        raise conflict(
            f"A member with this phone number already exists ({dups[0].member_number}). "
            "Set allow_duplicate_phone to register anyway."
        )
    m = Member(
        organization_id=t.org_id,
        member_number=next_number(db, t.org_id, "member_seq", "M", 5),
        qr_token=secrets.token_urlsafe(24),
        **data,
    )
    db.add(m)
    db.flush()
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="create", entity="member",
          entity_id=m.id)
    db.refresh(m, ["subscriptions"])
    return member_detail(db, m, today_in(t.org.timezone))


@router.get("/{member_id}", response_model=MemberDetail)
def read_member(member_id: uuid.UUID, db: DB, t: Read):
    return member_detail(db, get_member(db, t.org_id, member_id), today_in(t.org.timezone))


@router.patch("/{member_id}", response_model=MemberDetail)
def update_member(member_id: uuid.UUID, body: MemberUpdate, db: DB, t: Write):
    m = get_member(db, t.org_id, member_id)
    data = body.model_dump(exclude_unset=True)
    if "phone" in data and data["phone"]:
        data["phone"] = normalize_phone(data["phone"])
    for k, v in data.items():
        setattr(m, k, v)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="update", entity="member",
          entity_id=m.id, data={k: str(v) for k, v in data.items()})
    return member_detail(db, m, today_in(t.org.timezone))


@router.post("/{member_id}/regenerate-qr", response_model=MemberDetail)
def regenerate_qr(member_id: uuid.UUID, db: DB, t: Write):
    """Invalidate a lost or shared QR pass."""
    m = get_member(db, t.org_id, member_id)
    m.qr_token = secrets.token_urlsafe(24)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="regenerate_qr", entity="member",
          entity_id=m.id)
    return member_detail(db, m, today_in(t.org.timezone))
