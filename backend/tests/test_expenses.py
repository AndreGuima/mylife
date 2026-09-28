from fastapi.testclient import TestClient


def _create_dream(client: TestClient) -> int:
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva de emergencia",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    return dream_res.json()["id"]


def _create_account(
    client: TestClient, dream_id: int, *, allow_payments: bool = True
) -> int:
    create_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Principal",
            "objective_dream_id": dream_id,
            "total_value": "1000.00",
            "allow_payments": allow_payments,
        },
    )
    assert create_res.status_code == 201
    return create_res.json()["id"]


def _create_card(client: TestClient) -> int:
    create_res = client.post(
        "/credit-cards",
        json={"name": "Nubank"},
    )
    assert create_res.status_code == 201
    return create_res.json()["id"]


def _create_category(client: TestClient, name: str = "Alimentacao") -> int:
    create_res = client.post(
        "/expense-categories",
        json={"name": name},
    )
    assert create_res.status_code == 201
    return create_res.json()["id"]


def _get_account_total(client: TestClient, account_id: int) -> str:
    list_res = client.get("/bank-accounts")
    assert list_res.status_code == 200
    account = next(item for item in list_res.json() if item["id"] == account_id)
    return account["total_value"]


def test_expenses_crud_debit_and_credit(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    card_id = _create_card(client)
    category_food_id = _create_category(client, "Alimentacao")
    category_health_id = _create_category(client, "Saude")
    category_market_id = _create_category(client, "Supermercado")

    create_debit_res = client.post(
        "/expenses",
        json={
            "value": "79.90",
            "description": "Mercado",
            "expense_category_id": category_food_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert create_debit_res.status_code == 201
    debit_created = create_debit_res.json()
    assert debit_created["payment_method"] == "debit"
    assert debit_created["bank_account_id"] == account_id
    assert debit_created["credit_card_id"] is None
    assert debit_created["expense_category_id"] == category_food_id
    assert debit_created["expense_category_name"] == "Alimentacao"
    assert _get_account_total(client, account_id) == "920.10"

    create_credit_res = client.post(
        "/expenses",
        json={
            "value": "220.00",
            "description": "Farmacia",
            "expense_category_id": category_health_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-02-21",
        },
    )
    assert create_credit_res.status_code == 201
    credit_created = create_credit_res.json()
    assert credit_created["payment_method"] == "credit"
    assert credit_created["credit_card_id"] == card_id
    assert credit_created["bank_account_id"] is None
    assert credit_created["expense_category_id"] == category_health_id
    assert _get_account_total(client, account_id) == "920.10"

    list_res = client.get("/expenses")
    assert list_res.status_code == 200
    listed = list_res.json()
    assert len(listed) == 2

    update_res = client.patch(
        f"/expenses/{debit_created['id']}",
        json={
            "description": "Mercado Mensal",
            "expense_category_id": category_market_id,
            "value": "99.00",
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["description"] == "Mercado Mensal"
    assert updated["expense_category_name"] == "Supermercado"
    assert updated["value"] == "99.00"
    assert _get_account_total(client, account_id) == "901.00"

    update_to_credit_res = client.patch(
        f"/expenses/{debit_created['id']}",
        json={
            "payment_method": "credit",
            "credit_card_id": card_id,
        },
    )
    assert update_to_credit_res.status_code == 200
    update_to_credit = update_to_credit_res.json()
    assert update_to_credit["payment_method"] == "credit"
    assert update_to_credit["bank_account_id"] is None
    assert update_to_credit["credit_card_id"] == card_id
    assert _get_account_total(client, account_id) == "1000.00"

    delete_res = client.delete(f"/expenses/{credit_created['id']}")
    assert delete_res.status_code == 204

    list_after_delete_res = client.get("/expenses")
    assert list_after_delete_res.status_code == 200
    assert len(list_after_delete_res.json()) == 1


def test_expenses_validation_for_payment_source(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)

    create_res = client.post(
        "/expenses",
        json={
            "value": "79.90",
            "description": "Mercado",
            "expense_category_id": 9999,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert create_res.status_code == 400


def test_create_debit_expense_rejects_account_without_payments(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id, allow_payments=False)
    category_id = _create_category(client, "Alimentacao")

    create_res = client.post(
        "/expenses",
        json={
            "value": "79.90",
            "description": "Mercado",
            "expense_category_id": category_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert create_res.status_code == 400
    assert (
        create_res.json()["detail"]
        == "Conta não habilitada para lançamento de despesas"
    )


def test_delete_debit_expense_restores_account_balance(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    category_id = _create_category(client, "Moradia")

    create_res = client.post(
        "/expenses",
        json={
            "value": "150.00",
            "description": "Aluguel",
            "expense_category_id": category_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert create_res.status_code == 201
    expense_id = create_res.json()["id"]
    assert _get_account_total(client, account_id) == "850.00"

    delete_res = client.delete(f"/expenses/{expense_id}")
    assert delete_res.status_code == 204
    assert _get_account_total(client, account_id) == "1000.00"


def test_update_debit_expense_moves_balance_between_accounts(client: TestClient):
    dream_id = _create_dream(client)
    account_a_id = _create_account(client, dream_id)
    create_account_b_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Secundaria",
            "objective_dream_id": dream_id,
            "total_value": "500.00",
        },
    )
    assert create_account_b_res.status_code == 201
    account_b_id = create_account_b_res.json()["id"]
    category_id = _create_category(client, "Transporte")

    create_res = client.post(
        "/expenses",
        json={
            "value": "200.00",
            "description": "Viagem",
            "expense_category_id": category_id,
            "payment_method": "debit",
            "bank_account_id": account_a_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert create_res.status_code == 201
    expense_id = create_res.json()["id"]

    assert _get_account_total(client, account_a_id) == "800.00"
    assert _get_account_total(client, account_b_id) == "500.00"

    move_res = client.patch(
        f"/expenses/{expense_id}",
        json={
            "payment_method": "debit",
            "bank_account_id": account_b_id,
        },
    )
    assert move_res.status_code == 200
    moved = move_res.json()
    assert moved["payment_method"] == "debit"
    assert moved["bank_account_id"] == account_b_id

    assert _get_account_total(client, account_a_id) == "1000.00"
    assert _get_account_total(client, account_b_id) == "300.00"


def test_list_expenses_filters(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    category_food_id = _create_category(client, "Alimentacao")
    category_transport_id = _create_category(client, "Transporte")

    expense_1 = client.post(
        "/expenses",
        json={
            "value": "30.00",
            "description": "Padaria",
            "expense_category_id": category_food_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-05",
        },
    )
    assert expense_1.status_code == 201

    expense_2 = client.post(
        "/expenses",
        json={
            "value": "50.00",
            "description": "Uber",
            "expense_category_id": category_transport_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-20",
        },
    )
    assert expense_2.status_code == 201

    expense_3 = client.post(
        "/expenses",
        json={
            "value": "100.00",
            "description": "Mercado",
            "expense_category_id": category_food_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-03-02",
        },
    )
    assert expense_3.status_code == 201

    by_year_month = client.get("/expenses?year=2026&month=2")
    assert by_year_month.status_code == 200
    assert len(by_year_month.json()) == 2

    by_range = client.get("/expenses?from=2026-02-10&to=2026-02-28")
    assert by_range.status_code == 200
    assert len(by_range.json()) == 1
    assert by_range.json()[0]["description"] == "Uber"

    by_category = client.get(f"/expenses?category_id={category_food_id}")
    assert by_category.status_code == 200
    assert len(by_category.json()) == 2
    assert all(
        item["expense_category_id"] == category_food_id for item in by_category.json()
    )


def test_list_expenses_filters_validation(client: TestClient):
    res_month_without_year = client.get("/expenses?month=2")
    assert res_month_without_year.status_code == 400
    assert (
        res_month_without_year.json()["detail"]
        == "year is required when month is provided"
    )

    res_invalid_range = client.get("/expenses?from=2026-03-10&to=2026-03-01")
    assert res_invalid_range.status_code == 400
    assert (
        res_invalid_range.json()["detail"]
        == "'from' must be less than or equal to 'to'"
    )


def test_list_expenses_pagination(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    category_id = _create_category(client, "Compras")

    for idx, launch_date in enumerate(
        ["2026-03-01", "2026-03-02", "2026-03-03"], start=1
    ):
        res = client.post(
            "/expenses",
            json={
                "value": str(10 * idx),
                "description": f"Item {idx}",
                "expense_category_id": category_id,
                "payment_method": "debit",
                "bank_account_id": account_id,
                "credit_card_id": None,
                "launch_date": launch_date,
            },
        )
        assert res.status_code == 201

    page_1 = client.get("/expenses?limit=2&offset=0")
    assert page_1.status_code == 200
    assert len(page_1.json()) == 2
    assert page_1.json()[0]["description"] == "Item 3"
    assert page_1.json()[1]["description"] == "Item 2"

    page_2 = client.get("/expenses?limit=2&offset=2")
    assert page_2.status_code == 200
    assert len(page_2.json()) == 1
    assert page_2.json()[0]["description"] == "Item 1"


def test_expenses_summary_endpoint(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    card_id = _create_card(client)
    food_category_id = _create_category(client, "Alimentacao")
    transport_category_id = _create_category(client, "Transporte")

    debit_food = client.post(
        "/expenses",
        json={
            "value": "80.00",
            "description": "Mercado",
            "expense_category_id": food_category_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-02-10",
        },
    )
    assert debit_food.status_code == 201

    credit_transport = client.post(
        "/expenses",
        json={
            "value": "20.00",
            "description": "Taxi",
            "expense_category_id": transport_category_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-02-11",
        },
    )
    assert credit_transport.status_code == 201

    debit_transport = client.post(
        "/expenses",
        json={
            "value": "50.00",
            "description": "Onibus",
            "expense_category_id": transport_category_id,
            "payment_method": "debit",
            "bank_account_id": account_id,
            "credit_card_id": None,
            "launch_date": "2026-03-01",
        },
    )
    assert debit_transport.status_code == 201

    summary = client.get("/expenses/summary?year=2026&month=2")
    assert summary.status_code == 200
    body = summary.json()

    assert body["count"] == 2
    assert body["total"] == "100.00"
    assert body["average"] == "50.00"
    assert body["credit_total"] == "20.00"
    assert body["debit_total"] == "80.00"
    assert len(body["by_category"]) == 2
    assert body["by_category"][0]["category_name"] == "Alimentacao"
    assert body["by_category"][0]["total"] == "80.00"


def test_expenses_summary_excludes_invoice_payment_expense(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    card_id = _create_card(client)
    category_id = _create_category(client, "Farmacia")

    credit_expense = client.post(
        "/expenses",
        json={
            "value": "14.06",
            "description": "Remedio",
            "expense_category_id": category_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-03-17",
        },
    )
    assert credit_expense.status_code == 201

    pay_res = client.post(
        "/expenses/pay-credit-invoice",
        json={
            "credit_card_id": card_id,
            "bank_account_id": account_id,
            "expense_ids": [credit_expense.json()["id"]],
            "launch_date": "2026-03-17",
        },
    )
    assert pay_res.status_code == 200

    summary = client.get("/expenses/summary?from=2026-03-17&to=2026-03-17")
    assert summary.status_code == 200
    body = summary.json()

    assert body["count"] == 1
    assert body["total"] == "14.06"
    assert body["average"] == "14.06"
    assert body["credit_total"] == "14.06"
    assert body["debit_total"] == "0.00"
    assert len(body["by_category"]) == 1
    assert body["by_category"][0]["category_name"] == "Farmacia"
    assert body["by_category"][0]["total"] == "14.06"


def test_pay_credit_invoice_creates_debit_expense_and_marks_items_paid(
    client: TestClient,
):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    card_id = _create_card(client)
    category_food_id = _create_category(client, "Alimentacao")

    credit_a = client.post(
        "/expenses",
        json={
            "value": "100.00",
            "description": "Mercado credito",
            "expense_category_id": category_food_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-03-01",
        },
    )
    assert credit_a.status_code == 201
    credit_b = client.post(
        "/expenses",
        json={
            "value": "50.00",
            "description": "Farmacia credito",
            "expense_category_id": category_food_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-03-03",
        },
    )
    assert credit_b.status_code == 201

    pay_res = client.post(
        "/expenses/pay-credit-invoice",
        json={
            "credit_card_id": card_id,
            "bank_account_id": account_id,
            "expense_ids": [credit_a.json()["id"], credit_b.json()["id"]],
            "launch_date": "2026-03-10",
        },
    )
    assert pay_res.status_code == 200
    body = pay_res.json()
    assert body["total_paid"] == "150.00"
    assert sorted(body["paid_expense_ids"]) == sorted(
        [credit_a.json()["id"], credit_b.json()["id"]]
    )
    assert body["payment_expense"]["payment_method"] == "debit"
    assert body["payment_expense"]["bank_account_id"] == account_id
    assert body["payment_expense"]["value"] == "150.00"

    listed_res = client.get("/expenses")
    assert listed_res.status_code == 200
    listed = listed_res.json()
    paid_items = {
        item["id"]: item
        for item in listed
        if item["id"] in [credit_a.json()["id"], credit_b.json()["id"]]
    }
    assert paid_items[credit_a.json()["id"]]["invoice_paid_at"] is not None
    assert paid_items[credit_b.json()["id"]]["invoice_paid_at"] is not None
    assert (
        paid_items[credit_a.json()["id"]]["invoice_payment_expense_id"]
        == body["payment_expense"]["id"]
    )
    assert _get_account_total(client, account_id) == "850.00"


def test_pay_credit_invoice_rejects_account_without_payments(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id, allow_payments=False)
    card_id = _create_card(client)
    category_id = _create_category(client, "Saude")

    credit = client.post(
        "/expenses",
        json={
            "value": "80.00",
            "description": "Consulta",
            "expense_category_id": category_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-03-01",
        },
    )
    assert credit.status_code == 201

    pay_res = client.post(
        "/expenses/pay-credit-invoice",
        json={
            "credit_card_id": card_id,
            "bank_account_id": account_id,
            "expense_ids": [credit.json()["id"]],
            "launch_date": "2026-03-05",
        },
    )
    assert pay_res.status_code == 400
    assert (
        pay_res.json()["detail"] == "Conta não habilitada para lançamento de despesas"
    )


def test_pay_credit_invoice_rejects_already_paid_item(client: TestClient):
    dream_id = _create_dream(client)
    account_id = _create_account(client, dream_id)
    card_id = _create_card(client)
    category_id = _create_category(client, "Saude")

    credit = client.post(
        "/expenses",
        json={
            "value": "80.00",
            "description": "Consulta",
            "expense_category_id": category_id,
            "payment_method": "credit",
            "bank_account_id": None,
            "credit_card_id": card_id,
            "launch_date": "2026-03-01",
        },
    )
    assert credit.status_code == 201
    expense_id = credit.json()["id"]

    first_pay = client.post(
        "/expenses/pay-credit-invoice",
        json={
            "credit_card_id": card_id,
            "bank_account_id": account_id,
            "expense_ids": [expense_id],
            "launch_date": "2026-03-05",
        },
    )
    assert first_pay.status_code == 200

    second_pay = client.post(
        "/expenses/pay-credit-invoice",
        json={
            "credit_card_id": card_id,
            "bank_account_id": account_id,
            "expense_ids": [expense_id],
            "launch_date": "2026-03-06",
        },
    )
    assert second_pay.status_code == 400
    assert (
        second_pay.json()["detail"] == "Existe despesa já vinculada a uma fatura paga"
    )
