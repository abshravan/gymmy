import os
import uuid

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/gymmy_test"
)

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(__file__))


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    cfg = Config(os.path.join(BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND, "alembic"))
    command.upgrade(cfg, "head")  # exercises the real migrations
    yield


@pytest.fixture(autouse=True)
def _clean():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} CASCADE"))


@pytest.fixture
def client():
    return TestClient(app)


class Gym:
    """A signed-up gym with an authenticated owner."""

    def __init__(self, client: TestClient, name: str):
        self.client = client
        self.email = f"owner-{uuid.uuid4().hex[:8]}@example.com"
        r = client.post("/api/v1/auth/signup", json={
            "gym_name": name, "owner_name": "Owner", "email": self.email,
            "password": "s3cret-pass", "timezone": "Asia/Kolkata", "currency": "INR",
        })
        assert r.status_code == 201, r.text
        self.tokens = r.json()
        self.headers = {"Authorization": f"Bearer {self.tokens['access_token']}"}

    def get(self, path, headers=None, **kw):
        return self.client.get(f"/api/v1{path}", headers=headers or self.headers, **kw)

    def post(self, path, json=None, headers=None, **kw):
        return self.client.post(f"/api/v1{path}", json=json, headers=headers or self.headers, **kw)

    def patch(self, path, json=None, headers=None, **kw):
        return self.client.patch(f"/api/v1{path}", json=json, headers=headers or self.headers, **kw)

    def staff(self, role: str) -> dict:
        email = f"{role}-{uuid.uuid4().hex[:8]}@example.com"
        r = self.post("/staff", {"name": role.title(), "email": email, "role": role,
                                 "password": "staff-pass-1"})
        assert r.status_code == 201, r.text
        tok = self.client.post("/api/v1/auth/login",
                               json={"email": email, "password": "staff-pass-1"}).json()
        return {"Authorization": f"Bearer {tok['access_token']}"}

    def plan(self, name="Monthly", value=1, unit="months", price="1500.00", **extra) -> dict:
        r = self.post("/membership-plans", {"name": name, "duration_value": value,
                                            "duration_unit": unit, "price": price, **extra})
        assert r.status_code == 201, r.text
        return r.json()

    def member(self, first="Asha", phone=None, **extra) -> dict:
        phone = phone or f"+9198{uuid.uuid4().int % 10**8:08d}"
        r = self.post("/members", {"first_name": first, "last_name": "K", "phone": phone,
                                   **extra})
        assert r.status_code == 201, r.text
        return r.json()

    def sell(self, member_id, plan_id, **body) -> dict:
        r = self.post(f"/members/{member_id}/subscriptions", {"plan_id": plan_id, **body})
        assert r.status_code == 201, r.text
        return r.json()


@pytest.fixture
def gym(client):
    return Gym(client, "Iron Temple")


@pytest.fixture
def other_gym(client):
    return Gym(client, "Rival Fitness")
