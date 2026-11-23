import re
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import DB, CurrentUser
from app.core.errors import bad_request, conflict
from app.core.permissions import Role, permissions_for
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    sha256,
    verify_password,
)
from app.models import Branch, Organization, RefreshToken, User
from app.modules.organizations import validate_currency, validate_timezone

router = APIRouter(prefix="/auth", tags=["auth"])


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class SignupIn(BaseModel):
    gym_name: str = Field(min_length=2, max_length=200)
    owner_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = None
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"


class MeOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    is_platform_admin: bool
    organization_id: uuid.UUID | None
    organization_name: str | None
    timezone: str | None
    currency: str | None
    permissions: list[str]


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def _issue_tokens(db, user: User) -> TokenPair:
    raw = new_opaque_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256(raw),
            expires_at=datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days),
        )
    )
    return TokenPair(
        access_token=create_access_token(user.id, user.organization_id), refresh_token=raw
    )


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "gym"
    return f"{slug}-{uuid.uuid4().hex[:6]}"


@router.post("/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: DB):
    """Self-service gym signup: creates the organization, a main branch and the owner."""
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise conflict("An account with this email already exists")
    org = Organization(
        name=body.gym_name,
        slug=_slugify(body.gym_name),
        email=email,
        phone=body.phone,
        timezone=validate_timezone(body.timezone),
        currency=validate_currency(body.currency),
    )
    db.add(org)
    db.flush()
    db.add(Branch(organization_id=org.id, name="Main branch"))
    owner = User(
        organization_id=org.id,
        name=body.owner_name,
        email=email,
        phone=body.phone,
        password_hash=hash_password(body.password),
        role=Role.OWNER,
    )
    db.add(owner)
    db.flush()
    audit(db, org_id=org.id, actor_id=owner.id, action="create", entity="organization",
          entity_id=org.id)
    return _issue_tokens(db, owner)


@router.post("/login", response_model=TokenPair)
def login(body: LoginIn, db: DB):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    if user.organization_id:
        org = db.get(Organization, user.organization_id)
        if org is None or org.status != "active":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Gym account is not active")
    return _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshIn, db: DB):
    """Rotates the refresh token: the presented token is revoked and a new pair issued."""
    rt = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if rt is None or rt.revoked_at is not None or rt.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = db.get(User, rt.user_id)
    if user is None or user.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    rt.revoked_at = now
    return _issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshIn, db: DB):
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(body.refresh_token)))
    if rt and rt.revoked_at is None:
        rt.revoked_at = datetime.now(UTC)


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DB):
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    return MeOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_platform_admin=user.is_platform_admin,
        organization_id=user.organization_id,
        organization_name=org.name if org else None,
        timezone=org.timezone if org else None,
        currency=org.currency if org else None,
        permissions=sorted(permissions_for(user.role)),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordIn, user: CurrentUser, db: DB):
    if not verify_password(body.current_password, user.password_hash):
        raise bad_request("Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    # Sign out other sessions.
    for rt in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ):
        rt.revoked_at = datetime.now(UTC)
    audit(db, org_id=user.organization_id, actor_id=user.id, action="change_password",
          entity="user", entity_id=user.id)
