import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.audit import audit
from app.core.deps import DB, PlatformAdmin
from app.core.errors import not_found
from app.models import Member, Organization

router = APIRouter(prefix="/platform", tags=["platform admin"])


class TenantOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    email: str | None
    status: str
    timezone: str
    currency: str
    member_count: int
    created_at: datetime


class TenantStatusIn(BaseModel):
    status: Literal["active", "suspended"]


def _out(o: Organization, members: int) -> TenantOut:
    return TenantOut(id=o.id, name=o.name, slug=o.slug, email=o.email, status=o.status,
                     timezone=o.timezone, currency=o.currency, member_count=members,
                     created_at=o.created_at)


@router.get("/organizations", response_model=list[TenantOut])
def list_tenants(db: DB, _: PlatformAdmin):
    counts = (select(Member.organization_id, func.count().label("n"))
              .group_by(Member.organization_id).subquery())
    rows = db.execute(select(Organization, func.coalesce(counts.c.n, 0))
                      .outerjoin(counts, counts.c.organization_id == Organization.id)
                      .order_by(Organization.created_at.desc())).all()
    return [_out(o, n) for o, n in rows]


@router.patch("/organizations/{org_id}", response_model=TenantOut)
def set_tenant_status(org_id: uuid.UUID, body: TenantStatusIn, db: DB, admin: PlatformAdmin):
    o = db.get(Organization, org_id)
    if o is None:
        raise not_found("Organization")
    o.status = body.status
    audit(db, org_id=None, actor_id=admin.id, action=f"tenant_{body.status}",
          entity="organization", entity_id=o.id)
    n = db.scalar(select(func.count()).select_from(Member).where(Member.organization_id == o.id))
    return _out(o, n or 0)
