import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.deps import DB, Tenant, require
from app.core.pagination import Page, PageParams, paginate
from app.core.permissions import P
from app.models import AuditLog

router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: uuid.UUID
    actor_id: uuid.UUID | None
    action: str
    entity: str
    entity_id: str | None
    metadata: dict | None = Field(None, validation_alias="data")
    created_at: datetime


@router.get("", response_model=Page[AuditOut])
def list_audit(db: DB, t: Annotated[Tenant, Depends(require(P.AUDIT_READ))],
               params: Annotated[PageParams, Depends()], entity: str | None = None,
               entity_id: str | None = None):
    stmt = select(AuditLog).where(AuditLog.organization_id == t.org_id)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    rows, total = paginate(db, stmt.order_by(AuditLog.created_at.desc()), params)
    return Page(items=rows, total=total, page=params.page, page_size=params.page_size)
