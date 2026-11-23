import uuid
from datetime import datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.audit import audit
from app.core.deps import DB, Tenant, get_tenant, require
from app.core.errors import bad_request, not_found
from app.core.permissions import P
from app.models import Branch, Organization

router = APIRouter(tags=["organization"])


def validate_timezone(tz: str) -> str:
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise bad_request(f"Unknown timezone: {tz}") from None
    return tz


def validate_currency(code: str) -> str:
    code = code.upper()
    if len(code) != 3 or not code.isalpha():
        raise bad_request("Currency must be a 3-letter ISO code")
    return code


class OrgOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    slug: str
    email: str | None
    phone: str | None
    address: str | None
    timezone: str
    currency: str
    renewal_mode: str
    status: str
    created_at: datetime


class OrgUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=200)
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    timezone: str | None = None
    currency: str | None = None
    renewal_mode: Literal["after_current", "immediate"] | None = None


class BranchIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    phone: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    address: str | None = None
    phone: str | None = None
    status: Literal["active", "inactive"] | None = None


class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    address: str | None
    phone: str | None
    status: str


@router.get("/organization", response_model=OrgOut)
def get_org(t: Annotated[Tenant, Depends(get_tenant)]):
    return t.org


@router.patch("/organization", response_model=OrgOut)
def update_org(body: OrgUpdate, db: DB, t: Annotated[Tenant, Depends(require(P.ORG_MANAGE))]):
    data = body.model_dump(exclude_unset=True)
    if "timezone" in data:
        data["timezone"] = validate_timezone(data["timezone"])
    if "currency" in data:
        data["currency"] = validate_currency(data["currency"])
    org = db.get(Organization, t.org_id)
    for k, v in data.items():
        setattr(org, k, v)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="update", entity="organization",
          entity_id=t.org_id, data=data)
    return org


@router.get("/branches", response_model=list[BranchOut])
def list_branches(db: DB, t: Annotated[Tenant, Depends(get_tenant)]):
    return db.scalars(
        select(Branch).where(Branch.organization_id == t.org_id).order_by(Branch.created_at)
    ).all()


@router.post("/branches", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
def create_branch(body: BranchIn, db: DB, t: Annotated[Tenant, Depends(require(P.ORG_MANAGE))]):
    b = Branch(organization_id=t.org_id, **body.model_dump())
    db.add(b)
    db.flush()
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="create", entity="branch",
          entity_id=b.id)
    return b


@router.patch("/branches/{branch_id}", response_model=BranchOut)
def update_branch(
    branch_id: uuid.UUID, body: BranchUpdate, db: DB,
    t: Annotated[Tenant, Depends(require(P.ORG_MANAGE))],
):
    b = db.scalar(select(Branch).where(Branch.id == branch_id, Branch.organization_id == t.org_id))
    if b is None:
        raise not_found("Branch")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    return b


def get_branch(db, org_id: uuid.UUID, branch_id: uuid.UUID | None) -> Branch | None:
    if branch_id is None:
        return None
    b = db.scalar(select(Branch).where(Branch.id == branch_id, Branch.organization_id == org_id))
    if b is None:
        raise not_found("Branch")
    return b
