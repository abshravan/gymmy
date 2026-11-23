from datetime import date, timedelta

from app.core.timeutil import add_months, today_in

TODAY = lambda: today_in("Asia/Kolkata")  # noqa: E731


def test_member_crud_and_search(gym):
    m = gym.member("Priya", phone="+91 98765-43210", email="priya@example.com")
    assert m["phone"] == "+919876543210"
    assert m["membership_status"] == "none"
    gym.member("Rahul")
    assert gym.get("/members", params={"q": "priya"}).json()["total"] == 1
    assert gym.get("/members", params={"q": "98765"}).json()["total"] == 1
    assert gym.get("/members", params={"q": m["member_number"]}).json()["total"] == 1
    assert gym.get("/members").json()["total"] == 2

    r = gym.patch(f"/members/{m['id']}", {"status": "inactive"})
    assert r.json()["status"] == "inactive"
    assert gym.get("/members", params={"status": "inactive"}).json()["total"] == 1


def test_duplicate_phone_warning(gym):
    gym.member(phone="9000000001")
    assert len(gym.get("/members/duplicates", params={"phone": "9000000001"}).json()) == 1
    r = gym.post("/members", {"first_name": "Twin", "phone": "9000000001"})
    assert r.status_code == 409 and "M00001" in r.json()["detail"]
    r = gym.post("/members", {"first_name": "Twin", "phone": "9000000001",
                              "allow_duplicate_phone": True})
    assert r.status_code == 201


def test_plan_durations_give_correct_end_dates(gym):
    m = gym.member()
    start = date(2027, 1, 31)
    cases = [(1, "months", add_months(start, 1) - timedelta(days=1)),
             (3, "months", add_months(start, 3) - timedelta(days=1)),
             (12, "months", date(2028, 1, 30)),
             (1, "days", start),
             (30, "days", start + timedelta(days=29))]
    for value, unit, expected in cases:
        plan = gym.plan(name=f"{value}{unit}", value=value, unit=unit)
        sale = gym.sell(m["id"], plan["id"], start_date=start.isoformat())
        assert sale["subscription"]["end_date"] == expected.isoformat(), (value, unit)
        gym.post(f"/subscriptions/{sale['subscription']['id']}/cancel", {"reason": "test reset"})


def test_sale_with_partial_payment_and_discount(gym):
    plan = gym.plan(price="3000.00")
    m = gym.member()
    sale = gym.sell(m["id"], plan["id"], discount="500.00",
                    payment={"amount": "1000.00", "method": "cash"})
    sub = sale["subscription"]
    assert sub["price"] == "2500.00" and sub["discount"] == "500.00"
    assert sub["amount_paid"] == "1000.00" and sub["balance_due"] == "1500.00"
    assert sub["payment_status"] == "partial"
    assert sale["payment"]["receipt"]["number"] == "R000001"
    detail = gym.get(f"/members/{m['id']}").json()
    assert detail["membership_status"] == "active"
    assert detail["total_balance_due"] == "1500.00"


def test_overlapping_sale_rejected(gym):
    plan = gym.plan()
    m = gym.member()
    gym.sell(m["id"], plan["id"])
    r = gym.post(f"/members/{m['id']}/subscriptions", {"plan_id": plan["id"]})
    assert r.status_code == 409


def test_archived_plan_cannot_be_sold_and_snapshot_kept(gym):
    plan = gym.plan(price="1000.00")
    m = gym.member()
    sale = gym.sell(m["id"], plan["id"])
    gym.patch(f"/membership-plans/{plan['id']}", {"price": "2000.00", "status": "archived"})
    assert gym.get(f"/subscriptions/{sale['subscription']['id']}").json()["price"] == "1000.00"
    assert gym.get("/membership-plans").json() == []
    m2 = gym.member()
    r = gym.post(f"/members/{m2['id']}/subscriptions", {"plan_id": plan["id"]})
    assert r.status_code == 400


def test_renewal_after_current_and_immediate(gym):
    plan = gym.plan(value=30, unit="days")
    m = gym.member()
    first = gym.sell(m["id"], plan["id"])["subscription"]
    r = gym.post(f"/subscriptions/{first['id']}/renew", {})
    assert r.status_code == 201
    renewed = r.json()["subscription"]
    assert renewed["start_date"] == (date.fromisoformat(first["end_date"])
                                     + timedelta(days=1)).isoformat()
    assert renewed["renewed_from_id"] == first["id"]
    assert renewed["status"] == "upcoming"
    # can't renew the same subscription twice
    assert gym.post(f"/subscriptions/{first['id']}/renew", {}).status_code == 409
    # history kept
    assert len(gym.get(f"/members/{m['id']}").json()["subscriptions"]) == 2

    gym.patch("/organization", {"renewal_mode": "immediate"})
    m2 = gym.member()
    s2 = gym.sell(m2["id"], plan["id"])["subscription"]
    r2 = gym.post(f"/subscriptions/{s2['id']}/renew", {}).json()["subscription"]
    assert r2["start_date"] == TODAY().isoformat()


def test_renewal_of_expired_starts_today(gym):
    plan = gym.plan(value=10, unit="days")
    m = gym.member()
    old = gym.sell(m["id"], plan["id"],
                   start_date=(TODAY() - timedelta(days=40)).isoformat())["subscription"]
    assert old["status"] == "expired"
    new = gym.post(f"/subscriptions/{old['id']}/renew", {}).json()["subscription"]
    assert new["start_date"] == TODAY().isoformat()


def test_freeze_unfreeze_extends_end_date_with_cap(gym):
    plan = gym.plan(value=30, unit="days", max_freeze_days=5)
    m = gym.member()
    start = TODAY() - timedelta(days=10)
    sub = gym.sell(m["id"], plan["id"], start_date=start.isoformat())["subscription"]
    original_end = date.fromisoformat(sub["end_date"])

    r = gym.post(f"/subscriptions/{sub['id']}/freeze",
                 {"start_date": (TODAY() - timedelta(days=3)).isoformat(), "reason": "travel"})
    assert r.status_code == 200 and r.json()["status"] == "frozen"
    assert gym.get(f"/members/{m['id']}").json()["membership_status"] == "frozen"
    assert gym.post(f"/subscriptions/{sub['id']}/freeze", {}).status_code == 400

    r = gym.post(f"/subscriptions/{sub['id']}/unfreeze", {})  # 3 days frozen
    body = r.json()
    assert body["status"] == "active"
    assert body["end_date"] == (original_end + timedelta(days=3)).isoformat()
    assert body["freezes"][0]["days_extended"] == 3

    # second freeze of 4 days only gets the remaining 2 allowance days
    gym.post(f"/subscriptions/{sub['id']}/freeze",
             {"start_date": (TODAY() - timedelta(days=4)).isoformat()})
    body = gym.post(f"/subscriptions/{sub['id']}/unfreeze", {}).json()
    assert body["end_date"] == (original_end + timedelta(days=5)).isoformat()
    assert [f["days_extended"] for f in body["freezes"]] == [3, 2]


def test_cancel_preserves_history(gym):
    plan = gym.plan()
    m = gym.member()
    sale = gym.sell(m["id"], plan["id"], payment={"amount": "1500", "method": "card"})
    sub_id = sale["subscription"]["id"]
    r = gym.post(f"/subscriptions/{sub_id}/cancel", {"reason": "moved city"})
    assert r.json()["status"] == "cancelled" and r.json()["amount_paid"] == "1500.00"
    detail = gym.get(f"/members/{m['id']}").json()
    assert detail["membership_status"] == "none"
    assert detail["subscriptions"][0]["status"] == "cancelled"
    assert gym.get("/payments", params={"member_id": m["id"]}).json()["total"] == 1
    assert gym.post(f"/subscriptions/{sub_id}/renew", {}).status_code == 400
