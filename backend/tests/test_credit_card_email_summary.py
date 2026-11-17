from datetime import date

import database as app_db
from core.templates import render_template
from fastapi.testclient import TestClient
from services.credit_card_cycle_summary import build_credit_card_email_context

# Ciclo com due_day=10 e referência 15/10/2026: 11/10/2026 a 10/11/2026.
# Limites: 1000 até o dia 20 e 2000 até o dia 5 -> planejado em 15/10 = 500.
TODAY = date(2026, 10, 15)


def _create_card(client: TestClient, name: str) -> int:
    res = client.post("/credit-cards", json={"name": name})
    assert res.status_code == 201
    return res.json()["id"]


def _create_category(client: TestClient) -> int:
    res = client.post("/expense-categories", json={"name": "Mercado"})
    assert res.status_code == 201
    return res.json()["id"]


def _configure(client: TestClient, card_id: int, limits=None, due_day=10):
    if limits is None:
        limits = [
            {"day_of_month": 20, "limit_amount": "1000"},
            {"day_of_month": 5, "limit_amount": "2000"},
        ]
    res = client.put(
        f"/credit-cards/{card_id}/settings",
        json={"due_day": due_day, "limits": limits},
    )
    assert res.status_code == 200


def _spend(client: TestClient, card_id: int, category_id: int, value, launch):
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


def _context(today: date = TODAY) -> list[dict]:
    session = app_db.SessionLocal()
    try:
        return build_credit_card_email_context(session, 1, today)["credit_card_cycles"]
    finally:
        session.close()


def test_card_above_plan_counts_only_spending_until_today(client: TestClient):
    card_id = _create_card(client, "Nubank")
    category_id = _create_category(client)
    _configure(client, card_id)

    _spend(client, card_id, category_id, "100.00", "2026-10-10")  # ciclo anterior
    _spend(client, card_id, category_id, "400.00", "2026-10-11")
    _spend(client, card_id, category_id, "200.00", "2026-10-15")
    _spend(client, card_id, category_id, "999.00", "2026-10-16")  # depois de hoje

    [card] = _context()

    assert card["name"] == "Nubank"
    assert card["status"] == "above"
    assert card["situation_label"] == "R$ 100,00 acima"
    assert card["actual_label"] == "R$ 600,00"
    assert card["planned_label"] == "R$ 500,00"
    assert card["planned_total_label"] == "R$ 2.000,00"
    assert card["period_label"] == "11/10 a 10/11"
    assert card["due_date_label"] == "10/11"


def test_card_below_plan(client: TestClient):
    card_id = _create_card(client, "Nubank")
    category_id = _create_category(client)
    _configure(client, card_id)
    _spend(client, card_id, category_id, "57.61", "2026-10-12")

    [card] = _context()

    assert card["status"] == "below"
    assert card["situation_label"] == "R$ 442,39 abaixo"


def test_card_exactly_on_plan(client: TestClient):
    card_id = _create_card(client, "Nubank")
    category_id = _create_category(client)
    _configure(client, card_id)
    _spend(client, card_id, category_id, "500.00", "2026-10-12")

    [card] = _context()

    assert card["status"] == "on_track"
    assert card["situation_label"] == "Exatamente no planejado"


def test_matches_cycle_dashboard(client: TestClient):
    card_id = _create_card(client, "Nubank")
    category_id = _create_category(client)
    _configure(client, card_id)
    _spend(client, card_id, category_id, "321.45", "2026-10-13")

    dashboard = client.get(
        f"/credit-cards/{card_id}/cycle-dashboard",
        params={"reference_date": TODAY.isoformat()},
    ).json()
    [card] = _context()

    assert card["planned_label"] == "R$ 500,00"
    assert dashboard["planned_to_date"] == "500.00"
    assert card["actual_label"] == "R$ 321,45"


def test_cards_without_plan_are_skipped(client: TestClient):
    configured = _create_card(client, "Configurado")
    _configure(client, configured)
    no_limits = _create_card(client, "Sem limites")
    _configure(client, no_limits, limits=[])
    _create_card(client, "Sem fechamento")

    cards = _context()

    assert [c["name"] for c in cards] == ["Configurado"]


def test_user_without_cards_gets_empty_list(client: TestClient):
    assert _context() == []


def test_template_renders_credit_card_section():
    html = render_template(
        "emails/daily_quote.html",
        {
            "text": "Teste",
            "author": "Autor",
            "credit_card_cycles": [
                {
                    "name": "Nubank",
                    "status": "above",
                    "situation_label": "R$ 942,39 acima",
                    "actual_label": "R$ 1.442,39",
                    "planned_label": "R$ 500,00",
                    "planned_total_label": "R$ 2.000,00",
                    "period_label": "11/10 a 10/11",
                    "due_date_label": "17/11",
                }
            ],
        },
    )

    assert "Cartões de crédito" in html
    assert "Nubank" in html
    assert "Situação até hoje" in html
    assert "R$ 942,39 acima" in html
    assert "#dc2626" in html
    assert "vencimento em 17/11" in html


def test_template_hides_credit_card_section_without_cards():
    html = render_template(
        "emails/daily_quote.html",
        {"text": "Teste", "author": "Autor", "credit_card_cycles": []},
    )

    assert "Cartões de crédito" not in html
