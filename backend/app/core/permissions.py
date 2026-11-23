"""Role-based access control.

Permissions are `module:action` strings. Each built-in role maps to a default
permission set. Per-gym customisation can later be stored in the database; the
checks throughout the API only depend on `has_permission`.
"""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    RECEPTIONIST = "receptionist"
    TRAINER = "trainer"


class P(StrEnum):
    ORG_MANAGE = "org:manage"
    STAFF_READ = "staff:read"
    STAFF_MANAGE = "staff:manage"
    MEMBERS_READ = "members:read"
    MEMBERS_WRITE = "members:write"
    PLANS_READ = "plans:read"
    PLANS_MANAGE = "plans:manage"
    SUBSCRIPTIONS_WRITE = "subscriptions:write"
    SUBSCRIPTIONS_CANCEL = "subscriptions:cancel"
    PAYMENTS_READ = "payments:read"
    PAYMENTS_CREATE = "payments:create"
    PAYMENTS_REFUND = "payments:refund"
    ATTENDANCE_READ = "attendance:read"
    ATTENDANCE_CHECKIN = "attendance:checkin"
    ATTENDANCE_OVERRIDE = "attendance:override"
    DASHBOARD_READ = "dashboard:read"
    REPORTS_READ = "reports:read"
    AUDIT_READ = "audit:read"


ROLE_PERMISSIONS: dict[Role, frozenset[P]] = {
    Role.OWNER: frozenset(P),
    Role.MANAGER: frozenset(P) - {P.ORG_MANAGE, P.STAFF_MANAGE},
    Role.RECEPTIONIST: frozenset(
        {
            P.MEMBERS_READ,
            P.MEMBERS_WRITE,
            P.PLANS_READ,
            P.SUBSCRIPTIONS_WRITE,
            P.PAYMENTS_READ,
            P.PAYMENTS_CREATE,
            P.ATTENDANCE_READ,
            P.ATTENDANCE_CHECKIN,
            P.DASHBOARD_READ,
        }
    ),
    Role.TRAINER: frozenset({P.MEMBERS_READ, P.PLANS_READ, P.ATTENDANCE_READ}),
}


def permissions_for(role: str) -> frozenset[P]:
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return frozenset()


def has_permission(role: str, perm: P) -> bool:
    return perm in permissions_for(role)
