"""Database models.

Every gym-owned table carries `organization_id`. Queries in the API always filter
on the organization taken from the authenticated user, never from client input.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

Money = Numeric(12, 2)


def _id() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


def _org_fk() -> Mapped[uuid.UUID]:
    return mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = _id()
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(40))
    address: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    # "after_current": a renewal starts the day after the current membership ends.
    # "immediate": a renewal starts today.
    renewal_mode: Mapped[str] = mapped_column(String(20), default="after_current")
    status: Mapped[str] = mapped_column(String(20), default="active")
    member_seq: Mapped[int] = mapped_column(Integer, default=0)
    receipt_seq: Mapped[int] = mapped_column(Integer, default=0)
    # Sandbox gyms created by "Explore the demo"; deleted after demo_expires_at.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    demo_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = _created()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _id()
    # NULL only for platform super admins.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(30))
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = _created()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = _id()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("organization_id", "member_number"),
        UniqueConstraint("qr_token"),
        Index("ix_members_org_phone", "organization_id", "phone"),
    )

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    member_number: Mapped[str] = mapped_column(String(20))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(255))
    gender: Mapped[str | None] = mapped_column(String(20))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    address: Mapped[str | None] = mapped_column(Text)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)
    # active | suspended | inactive
    status: Mapped[str] = mapped_column(String(20), default="active")
    qr_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = _created()

    subscriptions: Mapped[list["Subscription"]] = relationship(
        back_populates="member", order_by="Subscription.start_date.desc()"
    )


class MembershipPlan(Base):
    __tablename__ = "membership_plans"
    __table_args__ = (
        CheckConstraint("duration_value > 0", name="ck_plan_duration_positive"),
        CheckConstraint("price >= 0", name="ck_plan_price_nonneg"),
    )

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    duration_value: Mapped[int] = mapped_column(Integer)
    duration_unit: Mapped[str] = mapped_column(String(10))  # days | months
    price: Mapped[Decimal] = mapped_column(Money)
    max_freeze_days: Mapped[int] = mapped_column(Integer, default=0)
    terms: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | archived
    created_at: Mapped[datetime] = _created()


class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="ck_sub_dates"),)

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("membership_plans.id"))
    # NULL = valid at every branch of the gym.
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id"))
    renewed_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subscriptions.id"))
    plan_name: Mapped[str] = mapped_column(String(200))  # snapshot at time of sale
    price: Mapped[Decimal] = mapped_column(Money)  # snapshot, after discount
    discount: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)  # inclusive
    # active | frozen | cancelled  (expiry is derived from end_date)
    status: Mapped[str] = mapped_column(String(20), default="active")
    cancelled_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created()

    member: Mapped[Member] = relationship(back_populates="subscriptions")
    freezes: Mapped[list["SubscriptionFreeze"]] = relationship(
        order_by="SubscriptionFreeze.created_at"
    )


class SubscriptionFreeze(Base):
    __tablename__ = "subscription_freezes"

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="CASCADE"), index=True
    )
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)  # set on unfreeze (exclusive)
    days_extended: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created()


class Payment(Base):
    """Money movements. Refunds are separate rows (kind='refund') linked via refund_of_id;
    original payments are never edited or deleted."""

    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key"),
        CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        Index("ix_payments_org_paid_at", "organization_id", "paid_at"),
    )

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    member_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("members.id"), index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10), default="payment")  # payment | refund
    refund_of_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payments.id"))
    amount: Mapped[Decimal] = mapped_column(Money)  # always positive
    method: Mapped[str] = mapped_column(String(20))  # cash | upi | card | bank_transfer
    reference: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created()

    receipt: Mapped["Receipt | None"] = relationship(back_populates="payment", uselist=False)


class Receipt(Base):
    __tablename__ = "receipts"
    __table_args__ = (UniqueConstraint("organization_id", "number"),)

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), unique=True)
    number: Mapped[str] = mapped_column(String(30))
    amount: Mapped[Decimal] = mapped_column(Money)
    issued_at: Mapped[datetime] = _created()

    payment: Mapped[Payment] = relationship(back_populates="receipt")


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (Index("ix_attendance_org_checkin", "organization_id", "check_in_at"),)

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID] = _org_fk()
    member_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("members.id", ondelete="CASCADE"), index=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id"))
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subscriptions.id"))
    check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    method: Mapped[str] = mapped_column(String(20))  # manual | qr | phone | member_number
    override_reason: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_org_created", "organization_id", "created_at"),)

    id: Mapped[uuid.UUID] = _id()
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE")
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict | None] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = _created()
