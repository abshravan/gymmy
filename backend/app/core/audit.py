import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def audit(
    db: Session,
    *,
    org_id: uuid.UUID | None,
    actor_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: Any = None,
    data: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            organization_id=org_id,
            actor_id=actor_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            data=data,
        )
    )
