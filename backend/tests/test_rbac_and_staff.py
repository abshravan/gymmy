def test_receptionist_permissions(gym):
    rec = gym.staff("receptionist")
    plan = gym.plan()
    # can do front-desk work
    r = gym.post("/members", {"first_name": "Ravi", "phone": "9876543210"}, headers=rec)
    assert r.status_code == 201
    member = r.json()
    r = gym.post(f"/members/{member['id']}/subscriptions",
                 {"plan_id": plan["id"], "payment": {"amount": "1500", "method": "upi"}},
                 headers=rec)
    assert r.status_code == 201
    pay_id = r.json()["payment"]["id"]
    assert gym.post("/attendance/check-in", {"member_id": member["id"]},
                    headers=rec).json()["allowed"]
    # but not admin or financial-control work
    assert gym.post(f"/payments/{pay_id}/refund", {"reason": "nope"},
                    headers=rec).status_code == 403
    assert gym.get("/reports/revenue", headers=rec).status_code == 403
    assert gym.post("/membership-plans", {"name": "X", "duration_value": 1,
                                          "duration_unit": "days", "price": "1"},
                    headers=rec).status_code == 403
    assert gym.get("/staff", headers=rec).status_code == 403
    assert gym.patch("/organization", {"name": "Mine"}, headers=rec).status_code == 403
    sub_id = gym.get(f"/members/{member['id']}").json()["subscriptions"][0]["id"]
    assert gym.post(f"/subscriptions/{sub_id}/cancel", {"reason": "because"},
                    headers=rec).status_code == 403


def test_trainer_is_read_only(gym):
    tr = gym.staff("trainer")
    m = gym.member()
    assert gym.get(f"/members/{m['id']}", headers=tr).status_code == 200
    assert gym.post("/members", {"first_name": "X", "phone": "12345"},
                    headers=tr).status_code == 403
    assert gym.post("/attendance/check-in", {"member_id": m["id"]},
                    headers=tr).status_code == 403
    assert gym.get("/payments", headers=tr).status_code == 403


def test_manager_cannot_manage_staff(gym):
    mgr = gym.staff("manager")
    assert gym.get("/staff", headers=mgr).status_code == 200
    assert gym.post("/staff", {"name": "A", "email": "a@example.com", "role": "owner"},
                    headers=mgr).status_code == 403
    assert gym.get("/reports/revenue", headers=mgr).status_code == 200


def test_staff_lifecycle(gym, client):
    r = gym.post("/staff", {"name": "Neha", "email": "neha@example.com", "role": "receptionist"})
    assert r.status_code == 201
    staff = r.json()
    temp = staff["temporary_password"]
    assert temp
    r = client.post("/api/v1/auth/login", json={"email": "neha@example.com", "password": temp})
    assert r.status_code == 200
    rt = r.json()["refresh_token"]

    assert gym.patch(f"/staff/{staff['id']}", {"status": "disabled"}).json()["status"] == "disabled"
    assert client.post("/api/v1/auth/login",
                       json={"email": "neha@example.com", "password": temp}).status_code == 403
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": rt}).status_code == 401

    gym.patch(f"/staff/{staff['id']}", {"status": "active"})
    new = gym.post(f"/staff/{staff['id']}/reset-password").json()["temporary_password"]
    assert client.post("/api/v1/auth/login",
                       json={"email": "neha@example.com", "password": new}).status_code == 200


def test_owner_cannot_lock_themselves_out(gym):
    me = gym.get("/auth/me").json()
    assert gym.patch(f"/staff/{me['id']}", {"role": "trainer"}).status_code == 400
    assert gym.patch(f"/staff/{me['id']}", {"status": "disabled"}).status_code == 400


def test_audit_log_records_actions(gym):
    m = gym.member()
    gym.patch(f"/members/{m['id']}", {"first_name": "Changed"})
    logs = gym.get("/audit-logs", params={"entity": "member"}).json()["items"]
    assert [entry["action"] for entry in logs] == ["update", "create"]
    assert logs[0]["metadata"] == {"first_name": "Changed"}
