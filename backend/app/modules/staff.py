import secrets
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select

from app.core.audit import audit
from app.core.deps import DB, Tenant, require
from app.core.errors import bad_request, conflict, not_found
from app.core.permissions import P, Role
from app.core.security import hash_password
from app.models import RefreshToken, User

router = APIRouter(prefix="/staff", tags=["staff"])

RoleName = Literal["owner", "manager", "receptionist", "trainer"]


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    email: str
    phone: str | None
    role: str
    status: str
    created_at: datetime


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str | None = None
    role: RoleName
    # If omitted, a temporary password is generated and returned once.
    password: str | None = Field(None, min_length=8, max_length=128)


class StaffCreated(StaffOut):
    temporary_password: str | None = None


class StaffUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    phone: str | None = None
    role: RoleName | None = None
    status: Literal["active", "disabled"] | None = None


class ResetPasswordOut(BaseModel):
    temporary_password: str


Manage = Annotated[Tenant, Depends(require(P.STAFF_MANAGE))]


def _get_staff(db, t: Tenant, user_id: uuid.UUID) -> User:
    u = db.scalar(select(User).where(User.id == user_id, User.organization_id == t.org_id))
    if u is None:
        raise not_found("Staff member")
    return u


def _revoke_sessions(db, user_id: uuid.UUID) -> None:
    for rt in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
    ):
        rt.revoked_at = datetime.now(UTC)


@router.get("", response_model=list[StaffOut])
def list_staff(db: DB, t: Annotated[Tenant, Depends(require(P.STAFF_READ))]):
    return db.scalars(
        select(User).where(User.organization_id == t.org_id).order_by(User.created_at)
    ).all()


@router.post("", response_model=StaffCreated, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffCreate, db: DB, t: Manage):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("A user with this email already exists")
    temp = None if body.password else secrets.token_urlsafe(9)
    u = User(
        organization_id=t.org_id,
        name=body.name,
        email=email,
        phone=body.phone,
        role=body.role,
        password_hash=hash_password(body.password or temp),
    )
    db.add(u)
    db.flush()
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="create", entity="staff",
          entity_id=u.id, data={"role": body.role})
    out = StaffCreated.model_validate(u)
    out.temporary_password = temp
    return out


@router.patch("/{user_id}", response_model=StaffOut)
def update_staff(user_id: uuid.UUID, body: StaffUpdate, db: DB, t: Manage):
    u = _get_staff(db, t, user_id)
    data = body.model_dump(exclude_unset=True)
    if u.id == t.user.id and (data.get("role", Role.OWNER) != Role.OWNER or
                              data.get("status", "active") != "active"):
        raise bad_request("You cannot demote or disable your own account")
    for k, v in data.items():
        setattr(u, k, v)
    if data.get("status") == "disabled":
        _revoke_sessions(db, u.id)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="update", entity="staff",
          entity_id=u.id, data=data)
    return u


@router.post("/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(user_id: uuid.UUID, db: DB, t: Manage):
    u = _get_staff(db, t, user_id)
    temp = secrets.token_urlsafe(9)
    u.password_hash = hash_password(temp)
    _revoke_sessions(db, u.id)
    audit(db, org_id=t.org_id, actor_id=t.user.id, action="reset_password", entity="staff",
          entity_id=u.id)
    return ResetPasswordOut(temporary_password=temp)
