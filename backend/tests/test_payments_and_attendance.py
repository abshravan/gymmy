from datetime import timedelta

from app.core.timeutil import today_in

TODAY = lambda: today_in("Asia/Kolkata")  # noqa: E731


def _sold(gym, price="2000.00", **sell):
    plan = gym.plan(price=price)
    m = gym.member()
    return m, gym.sell(m["id"], plan["id"], **sell)["subscription"]


def test_partial_payments_and_overpayment_guard(gym):
    m, sub = _sold(gym)
    pay = lambda amt: gym.post("/payments", {"member_id": m["id"], "subscription_id": sub["id"],  # noqa: E731
                                             "amount": amt, "method": "upi"})
    assert pay("1200.00").status_code == 201
    assert pay("900.00").status_code == 400  # only 800 due
    r = pay("800.00")
    assert r.status_code == 201 and r.json()["receipt"]["number"] == "R000002"
    s = gym.get(f"/subscriptions/{sub['id']}").json()
    assert s["payment_status"] == "paid" and s["balance_due"] == "0.00"


def test_payment_idempotency_key(gym):
    m, sub = _sold(gym)
    body = {"member_id": m["id"], "subscription_id": sub["id"], "amount": "500", "method": "cash"}
    h = {**gym.headers, "Idempotency-Key": "abc-123"}
    r1 = gym.post("/payments", body, headers=h)
    r2 = gym.post("/payments", body, headers=h)
    assert r1.status_code == 201 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    assert gym.get("/payments").json()["total"] == 1


def test_refund_keeps_original_and_is_audited(gym):
    m, sub = _sold(gym, payment={"amount": "2000", "method": "card"})
    pay_id = gym.get("/payments").json()["items"][0]["id"]

    r = gym.post(f"/payments/{pay_id}/refund", {"amount": "500", "reason": "billing error"})
    assert r.status_code == 201
    refund = r.json()
    assert refund["kind"] == "refund" and refund["refund_of_id"] == pay_id
    assert gym.get(f"/payments/{pay_id}").json()["amount"] == "2000.00"  # untouched
    assert gym.get(f"/subscriptions/{sub['id']}").json()["balance_due"] == "500.00"

    assert gym.post(f"/payments/{pay_id}/refund",
                    {"amount": "1600", "reason": "too much"}).status_code == 400
    assert gym.post(f"/payments/{pay_id}/refund", {"reason": "rest"}).json()["amount"] == "1500.00"
    assert gym.post(f"/payments/{pay_id}/refund", {"reason": "again"}).status_code == 409
    assert gym.post(f"/payments/{refund['id']}/refund", {"reason": "nope"}).status_code == 400
    logs = gym.get("/audit-logs", params={"entity": "payment", "entity_id": pay_id}).json()
    assert [entry["action"] for entry in logs["items"]].count("refund") == 2


def test_checkin_active_member_by_each_identifier(gym):
    m, _ = _sold(gym)
    r = gym.post("/attendance/check-in", {"qr_token": m["qr_token"]}).json()
    assert r["allowed"] and r["code"] == "ok" and r["attendance"]["method"] == "qr"
    # duplicate inside the window returns the same record
    for ident in ({"member_id": m["id"]}, {"member_number": m["member_number"].lower()},
                  {"phone": m["phone"]}):
        again = gym.post("/attendance/check-in", ident).json()
        assert again["code"] == "duplicate"
        assert again["attendance"]["id"] == r["attendance"]["id"]
    assert gym.get("/attendance").json()["total"] == 1
    out = gym.post(f"/attendance/{r['attendance']['id']}/check-out").json()
    assert out["check_out_at"] is not None


def test_checkin_requires_exactly_one_identifier(gym):
    assert gym.post("/attendance/check-in", {}).status_code == 422
    m = gym.member()
    assert gym.post("/attendance/check-in",
                    {"member_id": m["id"], "phone": m["phone"]}).status_code == 422


def test_checkin_blocked_with_clear_reasons(gym):
    plan = gym.plan(value=10, unit="days")
    none = gym.member()
    assert gym.post("/attendance/check-in", {"member_id": none["id"]}).json()["code"] == \
        "no_membership"

    expired = gym.member()
    gym.sell(expired["id"], plan["id"], start_date=(TODAY() - timedelta(days=30)).isoformat())
    r = gym.post("/attendance/check-in", {"member_id": expired["id"]}).json()
    assert not r["allowed"] and r["code"] == "expired" and "expired on" in r["message"]

    future = gym.member()
    gym.sell(future["id"], plan["id"], start_date=(TODAY() + timedelta(days=3)).isoformat())
    assert gym.post("/attendance/check-in", {"member_id": future["id"]}).json()["code"] == \
        "not_started"

    suspended = gym.member()
    gym.sell(suspended["id"], plan["id"])
    gym.patch(f"/members/{suspended['id']}", {"status": "suspended"})
    assert gym.post("/attendance/check-in", {"member_id": suspended["id"]}).json()["code"] == \
        "member_suspended"

    frozen = gym.member()
    sub = gym.sell(frozen["id"], plan["id"])["subscription"]
    gym.post(f"/subscriptions/{sub['id']}/freeze", {})
    assert gym.post("/attendance/check-in", {"member_id": frozen["id"]}).json()["code"] == \
        "frozen"

    assert gym.get("/attendance").json()["total"] == 0


def test_checkin_override_needs_permission_and_is_audited(gym):
    plan = gym.plan(value=10, unit="days")
    m = gym.member()
    gym.sell(m["id"], plan["id"], start_date=(TODAY() - timedelta(days=30)).isoformat())
    rec = gym.staff("receptionist")
    r = gym.post("/attendance/check-in", {"member_id": m["id"], "override_reason": "renewing"},
                 headers=rec)
    assert r.status_code == 403
    r = gym.post("/attendance/check-in", {"member_id": m["id"],
                                          "override_reason": "paying tomorrow"}).json()
    assert r["allowed"] and r["code"] == "override"
    assert r["attendance"]["override_reason"] == "[expired] paying tomorrow"
    assert gym.get("/audit-logs", params={"entity": "attendance"}).json()["total"] == 1


def test_branch_restricted_membership(gym):
    main = gym.get("/branches").json()[0]
    other = gym.post("/branches", {"name": "Downtown"}).json()
    plan = gym.plan()
    m = gym.member()
    gym.sell(m["id"], plan["id"], branch_id=main["id"])
    r = gym.post("/attendance/check-in", {"member_id": m["id"], "branch_id": other["id"]}).json()
    assert r["code"] == "wrong_branch"
    r = gym.post("/attendance/check-in", {"member_id": m["id"], "branch_id": main["id"]}).json()
    assert r["code"] == "ok"


def test_dashboard_and_reports_reconcile(gym):
    plan = gym.plan(value=5, unit="days", price="1000.00")
    a, b, c = gym.member("A"), gym.member("B"), gym.member("C")
    gym.sell(a["id"], plan["id"], payment={"amount": "1000", "method": "cash"})
    gym.sell(b["id"], plan["id"], payment={"amount": "400", "method": "upi"})
    gym.sell(c["id"], plan["id"], start_date=(TODAY() - timedelta(days=20)).isoformat())
    pay_a = gym.get("/payments", params={"member_id": a["id"]}).json()["items"][0]["id"]
    gym.post(f"/payments/{pay_a}/refund", {"amount": "100", "reason": "promo"})
    gym.post("/attendance/check-in", {"member_id": a["id"]})
    gym.post("/attendance/check-in", {"member_id": b["id"]})
    gym.post("/attendance/check-in", {"member_id": c["id"]})  # expired, refused

    d = gym.get("/dashboard/summary").json()
    assert d["active_members"] == 2
    assert d["total_members"] == 3
    assert d["new_members_this_month"] == 3
    assert d["checkins_today"] == 2
    assert d["collections_today"] == "1300.00"
    # A: 100 (refunded) + B: 600 + C: 1000
    assert d["outstanding_dues"] == "1700.00"
    assert d["expiring_next_7_days"] == 2
    assert {e["member_name"] for e in d["expiring_soon"]} == {"A K", "B K"}

    rev = gym.get("/reports/revenue", params={"date_from": TODAY().isoformat()}).json()
    assert rev["collected"] == "1400.00" and rev["refunded"] == "100.00"
    assert rev["net"] == "1300.00" and rev["payment_count"] == 2
    assert {x["method"]: x["net"] for x in rev["by_method"]} == {"cash": "900.00",
                                                                  "upi": "400.00"}
    assert rev["by_day"] == [{"date": TODAY().isoformat(), "net": "1300.00"}]

    att = gym.get("/reports/attendance", params={"date_from": TODAY().isoformat()}).json()
    assert att["total_checkins"] == 2 and att["unique_members"] == 2

    dues = gym.get("/reports/dues").json()
    assert sum(float(x["balance_due"]) for x in dues) == 1700.0
    csv = gym.get("/reports/dues", params={"format": "csv"})
    assert csv.headers["content-type"].startswith("text/csv")
    assert csv.text.count("\n") == 4  # header + 3 rows
