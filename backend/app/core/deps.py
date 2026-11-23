import uuid
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.permissions import P, has_permission, permissions_for
from app.core.security import decode_access_token
from app.models import Organization, User

_bearer = HTTPBearer(auto_error=False)

# scope="function": commit (or roll back) as soon as the endpoint returns, *before* the
# response is sent. With the default request scope FastAPI sends the response first, so a
# client could act on data that isn't committed yet, or be told a failed write succeeded.
DB = Annotated[Session, Depends(get_db, scope="function")]


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


def get_current_user(
    db: DB, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)
) -> User:
    if creds is None:
        raise _unauthorized()
    try:
        payload = decode_access_token(creds.credentials)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _unauthorized("Invalid or expired token") from None
    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise _unauthorized("User is not active")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class Tenant:
    """Request context for gym staff. The organization always comes from the
    authenticated user record, never from anything the client sends."""

    user: User
    org: Organization

    @property
    def org_id(self) -> uuid.UUID:
        return self.org.id

    def can(self, perm: P) -> bool:
        return has_permission(self.user.role, perm)

    @property
    def permissions(self) -> list[str]:
        return sorted(permissions_for(self.user.role))


def get_tenant(db: DB, user: CurrentUser) -> Tenant:
    if user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This endpoint is for gym staff")
    org = db.get(Organization, user.organization_id)
    if org is None or org.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Gym account is not active")
    return Tenant(user=user, org=org)


def require(perm: P):
    def dep(tenant: Annotated[Tenant, Depends(get_tenant)]) -> Tenant:
        if not tenant.can(perm):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {perm}")
        return tenant

    return dep


def require_platform_admin(user: CurrentUser) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admin only")
    return user


PlatformAdmin = Annotated[User, Depends(require_platform_admin)]
