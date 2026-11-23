import uuid
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import DB, Tenant, require
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.pagination import Page, PageParams
from app.core.permissions import P
from app.core.timeutil import local_day_bounds_utc, today_in, utcnow
from app.models import Attendance, Branch, Member
from app.modules.billing import current_subscription, effective_status
from app.modules.members import MemberOut, full_name, get_member, member_out, normalize_phone
from app.modules.organizations import get_branch

router = APIRouter(tags=["attendance"])

Read = Annotated[Tenant, Depends(require(P.ATTENDANCE_READ))]


class CheckInIn(BaseModel):
    """Identify the member by exactly one of: member_id, qr_token, member_number, phone."""
    member_id: uuid.UUID | None = None
    qr_token: str | None = None
    member_number: str | None = None
    phone: str | None = None
    branch_id: uuid.UUID | None = None
    # Lets an authorised user admit a member who would otherwise be refused.
    override_reason: str | None = Field(None, min_length=3, max_length=500)

    @model_validator(mode="after")
    def one_identifier(self):
        given = [v for v in (self.member_id, self.qr_token, self.member_number, self.phone) if v]
        if len(given) != 1:
            raise ValueError("Provide exactly one of member_id, qr_token, member_number, phone")
        return self


class AttendanceOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    member_number: str
    member_name: str
    branch_id: uuid.UUID | None
    check_in_at: datetime
    check_out_at: datetime | None
    method: str
    override_reason: str | None


class CheckInResult(BaseModel):
    allowed: bool
    # ok | duplicate | override | member_suspended | member_inactive | no_membership
    # | expired | frozen | not_started | wrong_branch
    code: str
    message: str
    member: MemberOut
    attendance: AttendanceOut | None = None


def _att_out(a: Attendance, m: Member) -> AttendanceOut:
    return AttendanceOut(
        id=a.id, member_id=m.id, member_number=m.member_number, member_name=full_name(m),
        branch_id=a.branch_id, check_in_at=a.check_in_at, check_out_at=a.check_out_at,
        method=a.method, override_reason=a.override_reason,
    )


def _find_member(db: Session, t: Tenant, body: CheckInIn) -> tuple[Member, str]:
    org = Member.organization_id == t.org_id
    if body.member_id:
        return get_member(db, t.org_id, body.member_id, lock=True), "manual"
    if body.qr_token:
        stmt, method = select(Member).where(org, Member.qr_token == body.qr_token), "qr"
    elif body.member_number:
        stmt = select(Member).where(org, Member.member_number == body.member_number.upper())
        method = "member_number"
    else:
        stmt = select(Member).where(org, Member.phone == normalize_phone(body.phone))
        method = "phone"
    matches = db.scalars(stmt.limit(2)).all()
    if not matches:
        raise not_found("Member")
    if len(matches) > 1:
        raise conflict("More than one member has this phone number; use the member number")
    return get_member(db, t.org_id, matches[0].id, lock=True), method


def _eligibility(m: Member, today: date, branch: Branch | None) -> tuple[str, str]:
    if m.status != "active":
        return f"member_{m.status}", f"Member account is {m.status}"
    sub = current_subscription(list(m.subscriptions), today)
    if sub is None:
        return "no_membership", "No membership on record"
    st = effective_status(sub, today)
    if st == "expired":
        return "expired", f"Membership expired on {sub.end_date:%d %b %Y}"
    if st == "frozen":
        return "frozen", "Membership is frozen"
    if st == "upcoming":
        return "not_started", f"Membership starts on {sub.start_date:%d %b %Y}"
    if sub.branch_id and branch and sub.branch_id != branch.id:
        return "wrong_branch", "Membership is not valid at this branch"
    return "ok", "Welcome! Check-in recorded"


@router.post("/attendance/check-in", response_model=CheckInResult)
def check_in(body: CheckInIn, db: DB,
             t: Annotated[Tenant, Depends(require(P.ATTENDANCE_CHECKIN))]):
    member, method = _find_member(db, t, body)  # row-locked: serialises concurrent check-ins
    branch = get_branch(db, t.org_id, body.branch_id)
    today = today_in(t.org.timezone)
    now = utcnow()

    window = timedelta(minutes=get_settings().checkin_dedupe_minutes)
    recent = db.scalar(
        select(Attendance).where(Attendance.organization_id == t.org_id,
                                 Attendance.member_id == member.id,
                                 Attendance.check_in_at >= now - window)
        .order_by(Attendance.check_in_at.desc()).limit(1)
    )
    if recent:
        return CheckInResult(allowed=True, code="duplicate",
                             message="Already checked in a moment ago",
                             member=member_out(member, today), attendance=_att_out(recent, member))

    code, message = _eligibility(member, today, branch)
    override = None
    if code != "ok":
        if not body.override_reason:
            return CheckInResult(allowed=False, code=code, message=message,
                                 member=member_out(member, today))
        if not t.can(P.ATTENDANCE_OVERRIDE):
            raise forbidden("You are not allowed to override check-in restrictions")
        override = f"[{code}] {body.override_reason}"

    sub = current_subscription(list(member.subscriptions), today)
    a = Attendance(
        organization_id=t.org_id, member_id=member.id, branch_id=branch.id if branch else None,
        subscription_id=sub.id if sub and code == "ok" else None, check_in_at=now,
        method=method, override_reason=override, recorded_by=t.user.id,
    )
    db.add(a)
    db.flush()
    if override:
        audit(db, org_id=t.org_id, actor_id=t.user.id, action="checkin_override",
              entity="attendance", entity_id=a.id, data={"reason": override})
        code, message = "override", "Checked in with manager override"
    return CheckInResult(allowed=True, code=code, message=message,
                         member=member_out(member, today), attendance=_att_out(a, member))


@router.post("/attendance/{attendance_id}/check-out", response_model=AttendanceOut)
def check_out(attendance_id: uuid.UUID, db: DB,
              t: Annotated[Tenant, Depends(require(P.ATTENDANCE_CHECKIN))]):
    a = db.scalar(select(Attendance).where(Attendance.id == attendance_id,
                                           Attendance.organization_id == t.org_id))
    if a is None:
        raise not_found("Attendance record")
    if a.check_out_at:
        raise bad_request("Already checked out")
    a.check_out_at = utcnow()
    return _att_out(a, db.get(Member, a.member_id))


def _list(db, t: Tenant, params: PageParams, *, member_id=None, branch_id=None,
          date_from=None, date_to=None) -> Page[AttendanceOut]:
    stmt = (select(Attendance, Member).join(Member, Member.id == Attendance.member_id)
            .where(Attendance.organization_id == t.org_id))
    if member_id:
        stmt = stmt.where(Attendance.member_id == member_id)
    if branch_id:
        stmt = stmt.where(Attendance.branch_id == branch_id)
    if date_from:
        stmt = stmt.where(Attendance.check_in_at >= local_day_bounds_utc(date_from,
                                                                          t.org.timezone)[0])
    if date_to:
        stmt = stmt.where(Attendance.check_in_at < local_day_bounds_utc(date_to,
                                                                         t.org.timezone)[1])
    stmt = stmt.order_by(Attendance.check_in_at.desc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.execute(stmt.offset((params.page - 1) * params.page_size)
                      .limit(params.page_size)).all()
    return Page(items=[_att_out(a, m) for a, m in rows], total=total, page=params.page,
                page_size=params.page_size)


@router.get("/attendance", response_model=Page[AttendanceOut])
def list_attendance(
    db: DB, t: Read, params: Annotated[PageParams, Depends()],
    member_id: uuid.UUID | None = None, branch_id: uuid.UUID | None = None,
    date_from: date | None = Query(None), date_to: date | None = Query(None),
):
    return _list(db, t, params, member_id=member_id, branch_id=branch_id,
                 date_from=date_from, date_to=date_to)


@router.get("/members/{member_id}/attendance", response_model=Page[AttendanceOut])
def member_attendance(member_id: uuid.UUID, db: DB, t: Read,
                      params: Annotated[PageParams, Depends()]):
    get_member(db, t.org_id, member_id)
    return _list(db, t, params, member_id=member_id)


