from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.models import Member, Organization


def _auth(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def _start(client, role="owner"):
    r = client.post("/api/v1/auth/demo", json={"role": role})
    assert r.status_code == 201, r.text
    return _auth(r.json())


def test_demo_gym_is_full_of_realistic_data(client):
    h = _start(client)
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["is_demo"] and me["role"] == "owner" and me["demo_expires_at"]

    d = client.get("/api/v1/dashboard/summary", headers=h).json()
    assert d["total_members"] >= 60
    assert d["active_members"] >= 40
    assert d["frozen_members"] == 2
    assert d["expiring_next_7_days"] >= 6
    assert float(d["outstanding_dues"]) > 0
    assert d["checkins_today"] >= 0

    statuses = {
        m["membership_status"]
        for m in client.get("/api/v1/members?page_size=200", headers=h).json()["items"]
    }
    assert {"active", "expired", "frozen", "upcoming", "none"} <= statuses
    assert client.get("/api/v1/payments?kind=refund", headers=h).json()["total"] == 1
    assert len(client.get("/api/v1/reports/dues", headers=h).json()) >= 7
    assert client.get("/api/v1/attendance?date_from=2000-01-01", headers=h).json()["total"] > 100
    assert len(client.get("/api/v1/staff", headers=h).json()) == 4
    assert len(client.get("/api/v1/branches", headers=h).json()) == 2


def test_each_visitor_gets_a_private_sandbox(client, gym):
    a, b = _start(client), _start(client)
    a_org = client.get("/api/v1/organization", headers=a).json()["id"]
    b_org = client.get("/api/v1/organization", headers=b).json()["id"]
    assert a_org != b_org
    member = client.get("/api/v1/members", headers=a).json()["items"][0]
    assert client.get(f"/api/v1/members/{member['id']}", headers=b).status_code == 404
    assert gym.get(f"/members/{member['id']}").status_code == 404
    assert gym.get("/auth/me").json()["is_demo"] is False


def test_switch_role_within_demo(client, gym):
    h = _start(client)
    org = client.get("/api/v1/organization", headers=h).json()["id"]
    r = client.post("/api/v1/auth/demo/switch", json={"role": "receptionist"}, headers=h)
    desk = _auth(r.json())
    me = client.get("/api/v1/auth/me", headers=desk).json()
    assert me["role"] == "receptionist" and me["organization_id"] == org
    assert client.get("/api/v1/reports/revenue", headers=desk).status_code == 403
    # real gyms can't use it
    assert gym.post("/auth/demo/switch", {"role": "owner"}).status_code == 403


def test_demo_can_start_as_receptionist(client):
    h = _start(client, role="receptionist")
    assert client.get("/api/v1/auth/me", headers=h).json()["role"] == "receptionist"


def test_expired_sandboxes_are_purged(client):
    _start(client)
    with SessionLocal() as db:
        db.execute(update(Organization).values(demo_expires_at=datetime.now(UTC) - timedelta(hours=1)))
        db.commit()
    _start(client)
    with SessionLocal() as db:
        orgs = db.scalars(select(Organization).where(Organization.is_demo.is_(True))).all()
        assert len(orgs) == 1
        assert db.scalar(select(Member).where(Member.organization_id != orgs[0].id)) is None


def test_demo_can_be_disabled(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_enabled", False)
    assert client.post("/api/v1/auth/demo", json={}).status_code == 404
