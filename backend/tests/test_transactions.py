"""The database commit must finish before the client gets a success response."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app


def test_failed_commit_is_reported_as_an_error(gym, monkeypatch):
    def broken_commit(self):
        raise RuntimeError("disk full")

    monkeypatch.setattr(Session, "commit", broken_commit)
    client = TestClient(app, raise_server_exceptions=False)
    body = {"first_name": "Ghost", "phone": "9999999999"}
    r = client.post("/api/v1/members", json=body, headers=gym.headers)
    # Before the fix the response (201) was sent before the commit ran, so the client was told
    # the member was saved even though it never was.
    assert r.status_code == 500
    monkeypatch.undo()
    assert gym.get("/members", params={"q": "Ghost"}).json()["total"] == 0


def test_write_is_visible_to_the_very_next_request(client):
    r = client.post("/api/v1/auth/demo", json={})
    assert r.status_code == 201
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200
