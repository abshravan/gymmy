"""Operational commands.

    python -m app.cli create-platform-admin --email admin@example.com --name "Admin"
    python -m app.cli seed-demo
"""

import argparse
import getpass

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.permissions import Role
from app.core.security import hash_password
from app.models import User


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


def seed_demo() -> None:
    """Creates a permanent demo gym with rich sample data.
    Sign in as owner@demo.gym, manager@demo.gym, receptionist@demo.gym or trainer@demo.gym
    with password demo-pass-1."""
    from app.modules.demo import build_demo_gym

    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == "owner@demo.gym")):
            raise SystemExit("Demo gym already exists")
        build_demo_gym(db, seed=42, is_demo=False, email_tag="demo.gym", password="demo-pass-1")
        db.commit()
    print("Demo gym created. Sign in as owner@demo.gym or receptionist@demo.gym / demo-pass-1")


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
