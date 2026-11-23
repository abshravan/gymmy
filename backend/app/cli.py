"""Operational commands.

    python -m app.cli create-platform-admin --email admin@example.com --name "Admin"
    python -m app.cli seed-demo
"""

import argparse
import getpass
import random
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.core.db import SessionLocal
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
    User,
)
from app.modules.plans import plan_end_date


def create_platform_admin(email: str, name: str) -> None:
    password = getpass.getpass("Password (min 8 chars): ")
    if len(password) < 8:
        raise SystemExit("Password too short")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email.lower())):
            raise SystemExit("A user with that email already exists")
        db.add(User(name=name, email=email.lower(), role=Role.OWNER, is_platform_admin=True,
                    password_hash=hash_password(password)))
        db.commit()
    print(f"Platform admin {email} created")


FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sara", "Vikram", "Ananya", "Arjun",
         "Isha", "Karan", "Nisha", "Dev", "Pooja", "Rahul", "Tara", "Neel", "Zoya", "Yash", "Riya"]
LAST = ["Sharma", "Iyer", "Patel", "Reddy", "Khan", "Nair", "Gupta", "Das", "Menon", "Singh"]


def seed_demo() -> None:
    """Creates a demo gym (owner@demo.gym / demo-pass-1) with plans, members, payments
    and check-ins. Safe to run once per database."""
    rnd = random.Random(42)
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == "owner@demo.gym")):
            raise SystemExit("Demo gym already exists")
        org = Organization(name="Demo Fitness Club", slug="demo-fitness", timezone="Asia/Kolkata",
                           currency="INR", email="owner@demo.gym")
        db.add(org)
        db.flush()
        branch = Branch(organization_id=org.id, name="Main branch")
        db.add(branch)
        owner = User(organization_id=org.id, name="Demo Owner", email="owner@demo.gym",
                     password_hash=hash_password("demo-pass-1"), role=Role.OWNER)
        desk = User(organization_id=org.id, name="Front Desk", email="desk@demo.gym",
                    password_hash=hash_password("demo-pass-1"), role=Role.RECEPTIONIST)
        db.add_all([owner, desk])
        plans = [
            MembershipPlan(organization_id=org.id, name="Monthly", duration_value=1,
                           duration_unit="months", price=Decimal("1500"), max_freeze_days=7),
            MembershipPlan(organization_id=org.id, name="Quarterly", duration_value=3,
                           duration_unit="months", price=Decimal("4000"), max_freeze_days=15),
            MembershipPlan(organization_id=org.id, name="Annual", duration_value=12,
                           duration_unit="months", price=Decimal("14000"), max_freeze_days=30),
            MembershipPlan(organization_id=org.id, name="Day pass", duration_value=1,
                           duration_unit="days", price=Decimal("200")),
        ]
        db.add_all(plans)
        db.flush()
        today = today_in(org.timezone)
        now = datetime.now(UTC)
        for i in range(40):
            org.member_seq += 1
            m = Member(organization_id=org.id, member_number=f"M{org.member_seq:05d}",
                       first_name=rnd.choice(FIRST), last_name=rnd.choice(LAST),
                       phone=f"+9198{rnd.randrange(10**8):08d}", qr_token=secrets.token_urlsafe(24))
            db.add(m)
            db.flush()
            plan = rnd.choice(plans[:3])
            start = today - timedelta(days=rnd.randrange(0, 120))
            sub = Subscription(organization_id=org.id, member_id=m.id, plan_id=plan.id,
                               plan_name=plan.name, price=plan.price, start_date=start,
                               end_date=plan_end_date(plan, start), created_by=owner.id)
            db.add(sub)
            db.flush()
            amount = plan.price if i % 4 else (plan.price / 2).quantize(Decimal("1"))
            paid_at = datetime.combine(start, datetime.min.time(), UTC) + timedelta(hours=5)
            p = Payment(organization_id=org.id, member_id=m.id, subscription_id=sub.id,
                        amount=amount, method=rnd.choice(["cash", "upi", "card"]),
                        paid_at=paid_at, recorded_by=desk.id)
            db.add(p)
            db.flush()
            org.receipt_seq += 1
            db.add(Receipt(organization_id=org.id, payment_id=p.id, amount=amount,
                           number=f"R{org.receipt_seq:06d}"))
            if sub.end_date >= today:
                for d in range(rnd.randrange(0, 12)):
                    t = now - timedelta(days=d * 2, hours=rnd.randrange(0, 10))
                    if t.date() >= start:
                        db.add(Attendance(organization_id=org.id, member_id=m.id,
                                          branch_id=branch.id, subscription_id=sub.id,
                                          check_in_at=t, method="qr", recorded_by=desk.id))
        db.commit()
    print("Demo gym created. Sign in as owner@demo.gym or desk@demo.gym / demo-pass-1")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("create-platform-admin")
    a.add_argument("--email", required=True)
    a.add_argument("--name", default="Platform Admin")
    sub.add_parser("seed-demo")
    args = parser.parse_args()
    if args.cmd == "create-platform-admin":
        create_platform_admin(args.email, args.name)
    else:
        seed_demo()


if __name__ == "__main__":
    main()
