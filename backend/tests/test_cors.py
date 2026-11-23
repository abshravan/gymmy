"""CORS behaviour as a browser sees it."""

import pytest
from fastapi.testclient import TestClient

from app.main import app


def _preflight(client, origin, headers="content-type,authorization,idempotency-key"):
    return client.options(
        "/api/v1/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                 "Access-Control-Request-Headers": headers},
    )


@pytest.mark.parametrize("origin", [
    "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://[::1]:3000",
])
def test_local_dev_origins_allowed(client, origin):
    r = _preflight(client, origin)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
    assert r.headers["access-control-allow-credentials"] == "true"
    allowed = r.headers["access-control-allow-headers"].lower()
    assert "idempotency-key" in allowed and "authorization" in allowed


@pytest.mark.parametrize("origin", ["https://evil.example", "http://localhost.evil.example:3000"])
def test_other_origins_rejected(client, origin):
    r = _preflight(client, origin)
    assert r.status_code == 400
    assert "access-control-allow-origin" not in r.headers


def test_error_responses_carry_cors_headers(client):
    r = client.get("/api/v1/members", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 401
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_unhandled_crash_is_json_500_with_cors_headers():
    def boom():
        raise RuntimeError("kaboom")

    app.add_api_route("/__test_boom", boom)
    try:
        client = TestClient(app, raise_server_exceptions=False)
        r = client.get("/__test_boom", headers={"Origin": "http://localhost:3000"})
        assert r.status_code == 500
        assert r.json() == {"detail": "Something went wrong on the server."}
        assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    finally:
        app.router.routes = [rt for rt in app.router.routes if getattr(rt, "path", "") != "/__test_boom"]


def test_csv_filename_is_readable_cross_origin(gym):
    r = gym.get("/reports/dues", params={"format": "csv"}, headers={**gym.headers, "Origin": "http://localhost:3000"})
    assert r.status_code == 200
    assert "content-disposition" in r.headers["access-control-expose-headers"].lower()
