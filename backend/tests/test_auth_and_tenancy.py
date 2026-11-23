def test_signup_login_me_refresh_logout(client, gym):
    me = gym.get("/auth/me").json()
    assert me["role"] == "owner" and me["organization_name"] == "Iron Temple"
    assert "payments:refund" in me["permissions"]

    r = client.post("/api/v1/auth/login", json={"email": gym.email, "password": "wrong-pass"})
    assert r.status_code == 401

    rt = gym.tokens["refresh_token"]
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 200
    new_rt = r.json()["refresh_token"]
    # rotated: old token can't be reused
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": rt}).status_code == 401
    assert client.post("/api/v1/auth/logout", json={"refresh_token": new_rt}).status_code == 204
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": new_rt}).status_code == 401


def test_requires_auth(client):
    assert client.get("/api/v1/members").status_code == 401
    bad = {"Authorization": "Bearer not-a-token"}
    assert client.get("/api/v1/members", headers=bad).status_code == 401


def test_duplicate_signup_email(client, gym):
    r = client.post("/api/v1/auth/signup", json={
        "gym_name": "Gym X", "owner_name": "Y", "email": gym.email, "password": "password1"})
    assert r.status_code == 409


def test_gym_a_cannot_see_or_touch_gym_b(gym, other_gym):
    plan = gym.plan()
    m = gym.member()
    sale = gym.sell(m["id"], plan["id"], payment={"amount": "500.00", "method": "cash"})
    pay_id = sale["payment"]["id"]
    sub_id = sale["subscription"]["id"]

    # reads
    assert other_gym.get(f"/members/{m['id']}").status_code == 404
    assert other_gym.get("/members").json()["total"] == 0
    assert other_gym.get(f"/membership-plans/{plan['id']}").status_code == 404
    assert other_gym.get(f"/payments/{pay_id}").status_code == 404
    assert other_gym.get(f"/subscriptions/{sub_id}").status_code == 404
    assert other_gym.get("/payments").json()["total"] == 0
    assert other_gym.get(f"/members/{m['id']}/attendance").status_code == 404
    assert other_gym.get("/reports/dues").json() == []
    assert other_gym.get("/dashboard/summary").json()["active_members"] == 0

    # writes
    assert other_gym.patch(f"/members/{m['id']}", {"first_name": "Hacked"}).status_code == 404
    assert other_gym.post(f"/members/{m['id']}/subscriptions",
                          {"plan_id": plan["id"]}).status_code == 404
    other_plan = other_gym.plan()
    assert other_gym.post(f"/members/{m['id']}/subscriptions",
                          {"plan_id": other_plan["id"]}).status_code == 404
    assert other_gym.post("/payments", {"member_id": m["id"], "amount": "10",
                                        "method": "cash"}).status_code == 404
    assert other_gym.post(f"/payments/{pay_id}/refund", {"reason": "steal"}).status_code == 404
    assert other_gym.post(f"/subscriptions/{sub_id}/renew", {}).status_code == 404
    assert other_gym.post("/attendance/check-in", {"member_id": m["id"]}).status_code == 404
    assert other_gym.post("/attendance/check-in",
                          {"qr_token": m["qr_token"]}).status_code == 404
    assert other_gym.post("/attendance/check-in",
                          {"member_number": m["member_number"]}).status_code == 404

    # data untouched
    assert gym.get(f"/members/{m['id']}").json()["first_name"] == "Asha"


def test_member_numbers_are_per_gym(gym, other_gym):
    assert gym.member()["member_number"] == "M00001"
    assert gym.member()["member_number"] == "M00002"
    assert other_gym.member()["member_number"] == "M00001"


def test_suspended_tenant_is_locked_out(client, gym):
    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models import User

    with SessionLocal() as db:
        db.add(User(name="Root", email="root@example.com", role="owner",
                    is_platform_admin=True, password_hash=hash_password("root-pass-1")))
        db.commit()
    tok = client.post("/api/v1/auth/login",
                      json={"email": "root@example.com", "password": "root-pass-1"}).json()
    admin = {"Authorization": f"Bearer {tok['access_token']}"}
    # platform admin is not a gym user
    assert client.get("/api/v1/members", headers=admin).status_code == 403
    # gym owner is not a platform admin
    assert gym.get("/platform/organizations").status_code == 403

    tenants = client.get("/api/v1/platform/organizations", headers=admin).json()
    org_id = tenants[0]["id"]
    r = client.patch(f"/api/v1/platform/organizations/{org_id}", json={"status": "suspended"},
                     headers=admin)
    assert r.json()["status"] == "suspended"
    assert gym.get("/members").status_code == 403
    r = client.post("/api/v1/auth/login", json={"email": gym.email, "password": "s3cret-pass"})
    assert r.status_code == 403
