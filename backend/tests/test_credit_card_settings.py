from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient
from services.credit_card_cycle import (
    build_planned_anchors,
    compute_cycle,
    map_day_to_cycle,
    planned_value_at,
)


# ---------------------------------------------------------------------------
# Pure cycle math
# ---------------------------------------------------------------------------
def test_compute_cycle_before_and_after_due_day():
    assert compute_cycle(10, date(2026, 11, 5)) == (
        date(2026, 10, 11),
        date(2026, 11, 10),
    )
    assert compute_cycle(10, date(2026, 11, 10)) == (
        date(2026, 10, 11),
        date(2026, 11, 10),
    )
    assert compute_cycle(10, date(2026, 11, 11)) == (
        date(2026, 11, 11),
        date(2026, 12, 10),
    )


def test_compute_cycle_crosses_year_and_clamps_short_months():
    assert compute_cycle(5, date(2026, 12, 20)) == (
        date(2026, 12, 6),
        date(2027, 1, 5),
    )
    # Due day 31: February has no 31st, so it is clamped to the 28th.
    assert compute_cycle(31, date(2027, 2, 10)) == (
        date(2027, 2, 1),
        date(2027, 2, 28),
    )
    assert compute_cycle(31, date(2027, 3, 1)) == (
        date(2027, 3, 1),
        date(2027, 3, 31),
    )


def test_map_day_to_cycle_prefers_exact_dates():
    start, end = date(2027, 1, 29), date(2027, 2, 28)
    assert map_day_to_cycle(29, start, end) == date(2027, 1, 29)
    assert map_day_to_cycle(28, start, end) == date(2027, 2, 28)
    assert map_day_to_cycle(5, start, end) == date(2027, 2, 5)


def test_planned_curve_interpolates_and_stays_flat():
    start, end = date(2026, 10, 11), date(2026, 11, 10)
    anchors = build_planned_anchors(
        [(20, Decimal("1000")), (5, Decimal("2000"))], start, end
    )
    # Day 20 falls in October, day 5 in November -> ordered by cycle date.
    assert anchors == [
        (date(2026, 10, 20), Decimal("1000")),
        (date(2026, 11, 5), Decimal("2000")),
    ]
    assert planned_value_at(anchors, start, date(2026, 10, 20)) == Decimal("1000.00")
    # Halfway (day 5 of 10) between start-1 and the first anchor.
    assert planned_value_at(anchors, start, date(2026, 10, 15)) == Decimal("500.00")
    assert planned_value_at(anchors, start, date(2026, 11, 8)) == Decimal("2000.00")
    assert planned_value_at([], start, date(2026, 11, 8)) is None


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
def _create_card(client: TestClient, name: str = "Nubank") -> int:
    res = client.post("/credit-cards", json={"name": name})
    assert res.status_code == 201
    return res.json()["id"]


def _create_category(client: TestClient) -> int:
    res = client.post("/expense-categories", json={"name": "Mercado"})
    assert res.status_code == 201
    return res.json()["id"]


def _create_credit_expense(
    client: TestClient, card_id: int, category_id: int, value: str, launch: str
):
    res = client.post(
        "/expenses",
        json={
            "value": value,
            "description": "Compra",
            "expense_category_id": category_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": launch,
        },
    )
    assert res.status_code == 201


def test_settings_default_and_replace(client: TestClient):
    card_id = _create_card(client)

    res = client.get(f"/credit-cards/{card_id}/settings")
    assert res.status_code == 200
    assert res.json() == {"credit_card_id": card_id, "due_day": None, "limits": []}

    res = client.put(
        f"/credit-cards/{card_id}/settings",
        json={
            "due_day": 10,
            "limits": [
                {"day_of_month": 25, "limit_amount": "1500.00"},
                {"day_of_month": 15, "limit_amount": "800"},
            ],
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["due_day"] == 10
    assert [
        (item["day_of_month"], Decimal(item["limit_amount"])) for item in body["limits"]
    ] == [(15, Decimal("800")), (25, Decimal("1500"))]

    # Replacing keeps a reused day without tripping the unique key.
    res = client.put(
        f"/credit-cards/{card_id}/settings",
        json={"due_day": 12, "limits": [{"day_of_month": 15, "limit_amount": "900"}]},
    )
    assert res.status_code == 200
    assert len(res.json()["limits"]) == 1
    assert Decimal(res.json()["limits"][0]["limit_amount"]) == Decimal("900")

    listed = client.get("/credit-cards").json()
    assert listed[0]["due_day"] == 12


def test_settings_validation(client: TestClient):
    card_id = _create_card(client)
    duplicate = client.put(
        f"/credit-cards/{card_id}/settings",
        json={
            "due_day": 10,
            "limits": [
                {"day_of_month": 5, "limit_amount": "1"},
                {"day_of_month": 5, "limit_amount": "2"},
            ],
        },
    )
    assert duplicate.status_code == 422

    for bad in (
        {"due_day": 0, "limits": []},
        {"due_day": 32, "limits": []},
        {"due_day": 10, "limits": [{"day_of_month": 32, "limit_amount": "1"}]},
        {"due_day": 10, "limits": [{"day_of_month": 3, "limit_amount": "-1"}]},
    ):
        assert (
            client.put(f"/credit-cards/{card_id}/settings", json=bad).status_code == 422
        )

    assert client.get("/credit-cards/9999/settings").status_code == 404


def test_cycle_dashboard_requires_due_day(client: TestClient):
    card_id = _create_card(client)
    res = client.get(f"/credit-cards/{card_id}/cycle-dashboard")
    assert res.status_code == 400


def test_cycle_dashboard_planned_vs_actual(client: TestClient):
    card_id = _create_card(client)
    other_card_id = _create_card(client, "Itau")
    category_id = _create_category(client)

    client.put(
        f"/credit-cards/{card_id}/settings",
        json={
            "due_day": 10,
            "limits": [
                {"day_of_month": 20, "limit_amount": "1000"},
                {"day_of_month": 5, "limit_amount": "2000"},
            ],
        },
    )

    _create_credit_expense(client, card_id, category_id, "100.00", "2026-10-10")  # prev
    _create_credit_expense(client, card_id, category_id, "300.00", "2026-10-11")
    _create_credit_expense(client, card_id, category_id, "200.00", "2026-10-11")
    _create_credit_expense(client, card_id, category_id, "50.50", "2026-11-03")
    _create_credit_expense(client, card_id, category_id, "999.00", "2026-11-11")  # next
    _create_credit_expense(client, other_card_id, category_id, "777.00", "2026-10-15")

    res = client.get(
        f"/credit-cards/{card_id}/cycle-dashboard",
        params={"reference_date": "2026-10-15"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["cycle_start"] == "2026-10-11"
    assert body["cycle_end"] == "2026-11-10"
    assert len(body["points"]) == 31
    assert Decimal(body["total_actual"]) == Decimal("550.50")
    assert Decimal(body["total_planned"]) == Decimal("2000.00")
    assert Decimal(body["planned_to_date"]) == Decimal("500.00")

    first = body["points"][0]
    assert first["date"] == "2026-10-11"
    assert Decimal(first["daily_spent"]) == Decimal("500.00")
    assert Decimal(first["actual_cumulative"]) == Decimal("500.00")

    thresholds = [p["date"] for p in body["points"] if p["is_threshold"]]
    assert thresholds == ["2026-10-20", "2026-11-05"]


def test_deleting_card_removes_limits(client: TestClient, db_session):
    from models.credit_card_spending_limit import CreditCardSpendingLimit

    card_id = _create_card(client)
    client.put(
        f"/credit-cards/{card_id}/settings",
        json={"due_day": 10, "limits": [{"day_of_month": 5, "limit_amount": "10"}]},
    )
    assert client.delete(f"/credit-cards/{card_id}").status_code == 204
    assert db_session.query(CreditCardSpendingLimit).count() == 0
