"""'Explore the demo': private sandbox gyms full of realistic sample data.

Each visitor gets their own throw-away gym, so nothing they click affects anyone
else. Sandboxes expire after `demo_ttl_hours` and are deleted lazily whenever a new
one is created.
"""

import random
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import DB, CurrentUser
from app.core.permissions import Role
from app.core.security import hash_password
from app.core.timeutil import today_in
from app.models import (
    Attendance,
    Branch,
    Member,
    MembershipPlan,
    Organization,
    Payment,
    Receipt,
    Subscription,
    SubscriptionFreeze,
    User,
)
from app.modules.auth import TokenPair, _issue_tokens
from app.modules.plans import plan_end_date

router = APIRouter(prefix="/auth/demo", tags=["demo"])

FIRST = [
    "Aarav",
    "Diya",
    "Kabir",
    "Meera",
    "Rohan",
    "Sara",
    "Vikram",
    "Ananya",
    "Arjun",
    "Isha",
    "Karan",
    "Nisha",
    "Dev",
    "Pooja",
    "Rahul",
    "Tara",
    "Neel",
    "Zoya",
    "Yash",
    "Riya",
    "Aditi",
    "Farhan",
    "Gauri",
    "Ishaan",
    "Jaya",
    "Kavya",
    "Laksh",
    "Mira",
    "Nikhil",
    "Priya",
    "Sahil",
    "Tanvi",
    "Uday",
    "Vani",
    "Aisha",
    "Rhea",
    "Om",
    "Sneha",
    "Varun",
    "Leela",
]
LAST = [
    "Sharma",
    "Iyer",
    "Patel",
    "Reddy",
    "Khan",
    "Nair",
    "Gupta",
    "Das",
    "Menon",
    "Singh",
    "Kapoor",
    "Bose",
    "Joshi",
    "Rao",
    "Pillai",
    "Mehta",
    "Verma",
    "Chopra",
]
NOTES = [
    "Prefers morning slots",
    "Training for a half marathon",
    "Referred by a friend",
    "Wants personal training info",
    None,
    None,
    None,
    None,
]

# (role, name) of the staff seeded into every demo gym. The first is who you sign in as.
STAFF = [
    (Role.OWNER, "Alex Morgan"),
    (Role.RECEPTIONIST, "Sam Front Desk"),
    (Role.MANAGER, "Jordan Manager"),
    (Role.TRAINER, "Riley Coach"),
]


class DemoIn(BaseModel):
    role: Role = Role.OWNER


def _purge_expired(db: Session) -> None:
    db.execute(
        delete(Organization).where(
            Organization.is_demo.is_(True), Organization.demo_expires_at < datetime.now(UTC)
        )
    )


class _Builder:
    """Writes rows directly (bypassing the API) so 'history' can be backdated."""

    def __init__(self, db: Session, org: Organization, owner: User, desk: User, rnd: random.Random):
        self.db, self.org, self.owner, self.desk, self.rnd = db, org, owner, desk, rnd
        self.tz = ZoneInfo(org.timezone)
        self.today = today_in(org.timezone)
        self.now = datetime.now(UTC)

    def at(self, day: date, hour: int, minute: int = 0) -> datetime:
        local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=self.tz)
        return min(local.astimezone(UTC), self.now - timedelta(minutes=1))

    def member(self, first: str, last: str, *, status: str = "active", joined: date) -> Member:
        self.org.member_seq += 1
        m = Member(
            organization_id=self.org.id,
            member_number=f"M{self.org.member_seq:05d}",
            first_name=first,
            last_name=last,
            phone=f"+9198{self.rnd.randrange(10**8):08d}",
            email=f"{first.lower()}.{last.lower()}@example.com" if self.rnd.random() < 0.6 else None,
            gender=self.rnd.choice(["Female", "Male", None]),
            date_of_birth=date(
                self.rnd.randint(1975, 2005), self.rnd.randint(1, 12), self.rnd.randint(1, 28)
            ),
            emergency_contact_name=f"{self.rnd.choice(FIRST)} {last}" if self.rnd.random() < 0.5 else None,
            notes=self.rnd.choice(NOTES),
            status=status,
            qr_token=secrets.token_urlsafe(24),
            created_at=self.at(joined, self.rnd.randint(7, 20)),
        )
        self.db.add(m)
        self.db.flush()
        return m

    def subscription(
        self,
        m: Member,
        plan: MembershipPlan,
        start: date,
        *,
        discount=Decimal("0"),
        status: str = "active",
        renewed_from: Subscription | None = None,
    ) -> Subscription:
        s = Subscription(
            organization_id=self.org.id,
            member_id=m.id,
            plan_id=plan.id,
            plan_name=plan.name,
            price=plan.price - discount,
            discount=discount,
            start_date=start,
            end_date=plan_end_date(plan, start),
            status=status,
            created_by=self.desk.id,
            renewed_from_id=renewed_from.id if renewed_from else None,
            created_at=self.at(min(start, self.today), 9),
        )
        self.db.add(s)
        self.db.flush()
        return s

    def pay(
        self, m: Member, s: Subscription | None, amount: Decimal, day: date, method: str | None = None
    ) -> Payment:
        method = method or self.rnd.choices(["upi", "cash", "card", "bank_transfer"], [5, 3, 2, 1])[0]
        p = Payment(
            organization_id=self.org.id,
            member_id=m.id,
            subscription_id=s.id if s else None,
            amount=amount,
            method=method,
            paid_at=self.at(day, self.rnd.randint(7, 20), self.rnd.randint(0, 59)),
            reference=f"UPI{self.rnd.randrange(10**9)}" if method == "upi" else None,
            recorded_by=self.desk.id,
        )
        self.db.add(p)
        self.db.flush()
        self.org.receipt_seq += 1
        self.db.add(
            Receipt(
                organization_id=self.org.id,
                payment_id=p.id,
                amount=amount,
                number=f"R{self.org.receipt_seq:06d}",
            )
        )
        return p

    def refund(self, original: Payment, amount: Decimal, reason: str, day: date) -> None:
        self.db.add(
            Payment(
                organization_id=self.org.id,
                member_id=original.member_id,
                subscription_id=original.subscription_id,
                kind="refund",
                refund_of_id=original.id,
                amount=amount,
                method=original.method,
                notes=reason,
                paid_at=self.at(day, 18),
                recorded_by=self.owner.id,
            )
        )

    def visits(self, m: Member, s: Subscription, *, per_week: float, until: date | None = None) -> None:
        """Check-ins on a realistic schedule: mostly mornings and evenings."""
        first = max(s.start_date, self.today - timedelta(days=45))
        last = min(until or s.end_date, self.today)
        day = first
        while day <= last:
            if self.rnd.random() < per_week / 7:
                hour = self.rnd.choice([6, 6, 7, 7, 8, 9, 12, 17, 18, 18, 19, 19, 20])
                t = self.at(day, hour, self.rnd.randint(0, 59))
                if t < self.now - timedelta(minutes=5):
                    self.db.add(
                        Attendance(
                            organization_id=self.org.id,
                            member_id=m.id,
                            subscription_id=s.id,
                            check_in_at=t,
                            check_out_at=t + timedelta(minutes=self.rnd.randint(45, 110)),
                            method=self.rnd.choices(["qr", "member_number", "phone", "manual"], [8, 2, 1, 1])[
                                0
                            ],
                            recorded_by=self.desk.id,
                        )
                    )
            day += timedelta(days=1)


def build_demo_gym(
    db: Session,
    *,
    name: str = "Pulse Fitness Studio",
    seed: int | None = None,
    is_demo: bool = True,
    email_tag: str | None = None,
    password: str | None = None,
) -> dict[Role, User]:
    """Create a fully populated gym. Returns its staff users by role."""
    settings = get_settings()
    rnd = random.Random(seed)
    tag = email_tag or uuid.uuid4().hex[:10]
    org = Organization(
        name=name,
        slug=f"demo-{tag}",
        timezone="Asia/Kolkata",
        currency="INR",
        email=f"hello+{tag}@example.com",
        phone="+91 80 4000 1234",
        address="12 MG Road, Bengaluru",
        is_demo=is_demo,
        demo_expires_at=datetime.now(UTC) + timedelta(hours=settings.demo_ttl_hours) if is_demo else None,
    )
    db.add(org)
    db.flush()
    main = Branch(organization_id=org.id, name="Indiranagar")
    db.add_all([main, Branch(organization_id=org.id, name="Koramangala")])

    pw_hash = hash_password(password or secrets.token_urlsafe(24))
    users: dict[Role, User] = {}
    for role, person in STAFF:
        u = User(
            organization_id=org.id,
            name=person,
            role=role,
            password_hash=pw_hash,
            email=f"{role.value}+{tag}@demo.gymmy.app" if is_demo else f"{role.value}@{tag}",
        )
        db.add(u)
        users[role] = u
    db.flush()

    plans = {
        "day": MembershipPlan(
            organization_id=org.id,
            name="Day pass",
            duration_value=1,
            duration_unit="days",
            price=Decimal("300"),
            description="Drop in for a single session",
        ),
        "monthly": MembershipPlan(
            organization_id=org.id,
            name="Monthly",
            duration_value=1,
            duration_unit="months",
            price=Decimal("2000"),
            max_freeze_days=7,
            description="Full gym access",
        ),
        "quarterly": MembershipPlan(
            organization_id=org.id,
            name="Quarterly",
            duration_value=3,
            duration_unit="months",
            price=Decimal("5400"),
            max_freeze_days=15,
            description="Save 10% vs monthly",
        ),
        "half": MembershipPlan(
            organization_id=org.id,
            name="Half-yearly",
            duration_value=6,
            duration_unit="months",
            price=Decimal("9600"),
            max_freeze_days=30,
        ),
        "annual": MembershipPlan(
            organization_id=org.id,
            name="Annual",
            duration_value=12,
            duration_unit="months",
            price=Decimal("16800"),
            max_freeze_days=45,
            description="Best value",
        ),
        "student": MembershipPlan(
            organization_id=org.id,
            name="Student monthly",
            duration_value=1,
            duration_unit="months",
            price=Decimal("1500"),
            description="Valid student ID required",
        ),
    }
    db.add_all(plans.values())
    db.add(
        MembershipPlan(
            organization_id=org.id,
            name="Summer bootcamp",
            duration_value=6,
            duration_unit="days",
            price=Decimal("1200"),
            status="archived",
        )
    )
    db.flush()

    b = _Builder(db, org, users[Role.OWNER], users[Role.RECEPTIONIST], rnd)
    t = b.today
    names = rnd.sample([(f, la) for f in FIRST for la in LAST], 64)
    regular = (
        [plans["monthly"]] * 5 + [plans["quarterly"]] * 3 + [plans["half"], plans["annual"], plans["student"]]
    )

    def person(i):
        return names[i]

    expired_members: list[Member] = []
    i = 0
    # 1. Healthy active members, fully paid, regular visitors.
    for _ in range(30):
        plan = rnd.choice(regular)
        start = t - timedelta(days=rnd.randint(0, max(1, (plan_end_date(plan, t) - t).days - 2)))
        m = b.member(*person(i), joined=start - timedelta(days=rnd.choice([0, 0, 40, 120, 300])))
        s = b.subscription(m, plan, start, discount=rnd.choice([Decimal("0")] * 4 + [Decimal("200")]))
        b.pay(m, s, s.price, start)
        b.visits(m, s, per_week=rnd.choice([1.5, 3, 4, 5]))
        i += 1
    # 2. Active but owing money (partial payments) — shows up in dues.
    for _ in range(7):
        plan = rnd.choice([plans["monthly"], plans["quarterly"], plans["half"]])
        start = t - timedelta(days=rnd.randint(1, 20))
        m = b.member(*person(i), joined=start)
        s = b.subscription(m, plan, start)
        b.pay(m, s, (s.price * Decimal(rnd.choice(["0.5", "0.4", "0.6"]))).quantize(Decimal("1")), start)
        b.visits(m, s, per_week=3)
        i += 1
    # 3. Expiring in the next week — the renewal call list.
    for _ in range(6):
        plan = plans["monthly"]
        end_in = rnd.randint(0, 6)
        start = t + timedelta(days=end_in) - (plan_end_date(plan, t) - t)
        m = b.member(*person(i), joined=start - timedelta(days=rnd.choice([0, 60])))
        s = b.subscription(m, plan, start)
        b.pay(m, s, s.price, start)
        b.visits(m, s, per_week=3.5)
        i += 1
    # 4. Renewed early: current membership plus an upcoming one already paid.
    for _ in range(3):
        plan = plans["monthly"]
        start = t - timedelta(days=rnd.randint(22, 27))
        m = b.member(*person(i), joined=start - timedelta(days=90))
        s = b.subscription(m, plan, start)
        b.pay(m, s, s.price, start)
        nxt = b.subscription(m, plan, s.end_date + timedelta(days=1), renewed_from=s)
        b.pay(m, nxt, nxt.price, t - timedelta(days=rnd.randint(0, 2)))
        b.visits(m, s, per_week=4)
        i += 1
    # 5. Expired and not renewed — blocked at the desk.
    for _ in range(7):
        plan = rnd.choice([plans["monthly"], plans["quarterly"]])
        end_ago = rnd.randint(2, 40)
        start = t - timedelta(days=end_ago) - (plan_end_date(plan, t) - t)
        m = b.member(*person(i), joined=start)
        s = b.subscription(m, plan, start)
        b.pay(m, s, s.price, start)
        b.visits(m, s, per_week=2)
        expired_members.append(m)
        i += 1
    # 6. Frozen (travelling / injured).
    for reason in ["Travelling for work", "Knee injury — physio for 2 weeks"]:
        plan = plans["quarterly"]
        start = t - timedelta(days=rnd.randint(20, 40))
        m = b.member(*person(i), joined=start)
        s = b.subscription(m, plan, start, status="frozen")
        b.pay(m, s, s.price, start)
        frozen_from = t - timedelta(days=rnd.randint(2, 6))
        db.add(
            SubscriptionFreeze(
                organization_id=org.id,
                subscription_id=s.id,
                start_date=frozen_from,
                reason=reason,
                created_by=b.desk.id,
            )
        )
        b.visits(m, s, per_week=3, until=frozen_from - timedelta(days=1))
        i += 1
    # 7. Starts in a few days.
    for _ in range(2):
        m = b.member(*person(i), joined=t)
        s = b.subscription(m, plans["monthly"], t + timedelta(days=rnd.randint(2, 5)))
        b.pay(m, s, s.price, t)
        i += 1
    # 8. Suspended account, with an active membership.
    m = b.member(*person(i), status="suspended", joined=t - timedelta(days=50))
    s = b.subscription(m, plans["quarterly"], t - timedelta(days=50))
    b.pay(m, s, s.price, t - timedelta(days=50))
    b.visits(m, s, per_week=2, until=t - timedelta(days=10))
    i += 1
    # 9. Cancelled with a partial refund.
    m = b.member(*person(i), joined=t - timedelta(days=15))
    s = b.subscription(m, plans["quarterly"], t - timedelta(days=15), status="cancelled")
    s.cancelled_reason = "Relocating to Pune"
    p = b.pay(m, s, s.price, t - timedelta(days=15), method="card")
    b.refund(p, Decimal("3600"), "Pro-rated refund for unused months", t - timedelta(days=3))
    i += 1
    # 10. A couple of walk-ins on day passes and brand-new sign-ups with nothing yet.
    for _ in range(2):
        m = b.member(*person(i), joined=t)
        s = b.subscription(m, plans["day"], t)
        b.pay(m, s, s.price, t, method="cash")
        i += 1
    for _ in range(2):
        b.member(*person(i), joined=t)
        i += 1

    # One check-in override for the audit trail.
    expired = expired_members[0]
    db.add(
        Attendance(
            organization_id=org.id,
            member_id=expired.id,
            check_in_at=b.at(t - timedelta(days=1), 18),
            method="member_number",
            override_reason="[expired] Renewing tomorrow, owner approved",
            recorded_by=users[Role.OWNER].id,
        )
    )
    audit(
        db,
        org_id=org.id,
        actor_id=users[Role.OWNER].id,
        action="create",
        entity="organization",
        entity_id=org.id,
        data={"demo": is_demo},
    )
    db.flush()
    return users


@router.post("", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def start_demo(body: DemoIn, db: DB):
    """Create a private sandbox gym with sample data and sign in to it."""
    s = get_settings()
    if not s.demo_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Demo is not available")
    _purge_expired(db)
    active = (
        db.scalar(select(func.count()).select_from(Organization).where(Organization.is_demo.is_(True))) or 0
    )
    if active >= s.demo_max_active:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The demo is busy right now. Please try again later."
        )
    users = build_demo_gym(db)
    return _issue_tokens(db, users[body.role])


@router.post("/switch", response_model=TokenPair)
def switch_role(body: DemoIn, user: CurrentUser, db: DB):
    """Inside a demo gym, jump to the same gym as a different role."""
    org = db.get(Organization, user.organization_id) if user.organization_id else None
    if org is None or not org.is_demo:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only available in the demo")
    target = db.scalar(
        select(User)
        .where(User.organization_id == org.id, User.role == body.role)
        .order_by(User.created_at)
        .limit(1)
    )
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No demo user with that role")
    return _issue_tokens(db, target)
