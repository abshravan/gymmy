import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.audit import audit
from app.core.deps import DB, Tenant, require
from app.core.errors import not_found
from app.core.permissions import P
from app.core.timeutil import add_months
from app.models import MembershipPlan

router = APIRouter(prefix="/membership-plans", tags=["membership plans"])

Unit = Literal["days", "months"]


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    duration_value: int = Field(gt=0, le=3650)
    duration_unit: Unit
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    max_freeze_days: int = Field(0, ge=0, le=365)
    terms: str | None = None


class PlanUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    duration_value: int | None = Field(None, gt=0, le=3650)
    duration_unit: Unit | None = None
    price: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=2)
    max_freeze_days: int | None = Field(None, ge=0, le=365)
    terms: str | None = None
    status: Literal["active", "archived"] | None = None


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    duration_value: int
    duration_unit: str
    price: Decimal
    max_freeze_days: int
    terms: str | None
    status: str


def plan_end_date(plan: MembershipPlan, start: date) -> date:
    """Inclusive end date: a 1-month plan starting Jan 15 ends Feb 14."""
    if plan.duration_unit == "months":
        return add_months(start, plan.duration_value) - timedelta(days=1)
    return start + timedelta(days=plan.duration_value - 1)


def get_plan(db, org_id: uuid.UUID, plan_id: uuid.UUID) -> MembershipPlan:
    p = db.scalar(
        select(MembershipPlan).where(
            MembershipPlan.id == plan_id, MembershipPlan.organization_id == org_id
        )
    )
    if p is None:
        raise not_found("Membership plan")
    return p


@router.get("", response_model=list[PlanOut])
def list_plans(
    db: DB,
    t: Annotated[Tenant, Depends(require(P.PLANS_READ))],
    include_archived: bool = Query(False),
):
    stmt = select(MembershipPlan).where(MembershipPlan.organization_id == t.org_id)
    if not include_archived:
        stmt = stmt.where(MembershipPlan.status == "active")
    return db.scalars(stmt.order_by(MembershipPlan.price, MembershipPlan.name)).all()


@router.post("", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(body: PlanIn, db: DB, t: Annotated[Tenant, Depends(require(P.PLANS_MANAGE))]):
    p = MembershipPlan(organization_id=t.org_id, **body.model_dump())
    db.add(p)
    db.flush()
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="create", entity="plan", entity_id=p.id)
    return p


@router.get("/{plan_id}", response_model=PlanOut)
def read_plan(plan_id: uuid.UUID, db: DB, t: Annotated[Tenant, Depends(require(P.PLANS_READ))]):
    return get_plan(db, t.org_id, plan_id)


@router.patch("/{plan_id}", response_model=PlanOut)
def update_plan(
    plan_id: uuid.UUID, body: PlanUpdate, db: DB,
    t: Annotated[Tenant, Depends(require(P.PLANS_MANAGE))],
):
    """Changes affect future sales only; existing subscriptions keep their snapshot."""
    p = get_plan(db, t.org_id, plan_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="update", entity="plan",
          entity_id=p.id, data={k: str(v) for k, v in data.items()})
    return p
