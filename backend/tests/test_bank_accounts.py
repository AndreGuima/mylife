from fastapi.testclient import TestClient
from models.bank_account_transaction import BankAccountTransaction
from models.bank_account_transfer import BankAccountTransfer
from models.dream import Dream
from models.user import User


def test_bank_accounts_crud(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Comprar casa",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    create_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Principal",
            "objective_dream_id": dream_id,
            "total_value": "2500.50",
        },
    )
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["name"] == "Conta Principal"
    assert created["objective_dream_id"] == dream_id
    assert created["objective_dream_title"] == "Comprar casa"
    assert created["total_value"] == "2500.50"
    assert created["allow_investment_income"] is False
    assert created["allow_payments"] is True

    list_res = client.get("/bank-accounts")
    assert list_res.status_code == 200
    listed = list_res.json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]

    update_res = client.patch(
        f"/bank-accounts/{created['id']}",
        json={
            "name": "Conta Corrente",
            "total_value": "3000.00",
            "allow_investment_income": True,
            "allow_payments": False,
        },
    )
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["name"] == "Conta Corrente"
    assert updated["total_value"] == "3000.00"
    assert updated["allow_investment_income"] is True
    assert updated["allow_payments"] is False

    delete_res = client.delete(f"/bank-accounts/{created['id']}")
    assert delete_res.status_code == 204

    list_after_delete_res = client.get("/bank-accounts")
    assert list_after_delete_res.status_code == 200
    assert list_after_delete_res.json() == []


def test_cannot_link_bank_account_to_other_user_dream(client: TestClient, db_session):
    other_user = User(
        id=2,
        username="other",
        email="other@example.com",
        password_hash="hash",
        role="user",
        is_active=True,
        is_verified=True,
    )
    db_session.add(other_user)
    db_session.flush()

    foreign_dream = Dream(user_id=other_user.id, title="Sonho de outro usuário")
    db_session.add(foreign_dream)
    db_session.commit()

    res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta indevida",
            "objective_dream_id": foreign_dream.id,
            "total_value": "100.00",
        },
    )
    assert res.status_code == 400


def test_list_bank_accounts_can_filter_allow_investment_income(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    first_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Dividendos",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
            "allow_investment_income": True,
        },
    )
    assert first_res.status_code == 201

    second_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Sem Proventos",
            "objective_dream_id": dream_id,
            "total_value": "50.00",
            "allow_investment_income": False,
        },
    )
    assert second_res.status_code == 201

    filtered_true_res = client.get("/bank-accounts?allow_investment_income=true")
    assert filtered_true_res.status_code == 200
    filtered_true = filtered_true_res.json()
    assert len(filtered_true) == 1
    assert filtered_true[0]["id"] == first_res.json()["id"]

    filtered_false_res = client.get("/bank-accounts?allow_investment_income=false")
    assert filtered_false_res.status_code == 200
    filtered_false = filtered_false_res.json()
    assert len(filtered_false) == 1
    assert filtered_false[0]["id"] == second_res.json()["id"]


def test_list_bank_accounts_can_filter_allow_payments(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    first_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Despesas",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
            "allow_payments": True,
        },
    )
    assert first_res.status_code == 201

    second_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Bloqueada",
            "objective_dream_id": dream_id,
            "total_value": "50.00",
            "allow_payments": False,
        },
    )
    assert second_res.status_code == 201

    filtered_true_res = client.get("/bank-accounts?allow_payments=true")
    assert filtered_true_res.status_code == 200
    filtered_true = filtered_true_res.json()
    assert len(filtered_true) == 1
    assert filtered_true[0]["id"] == first_res.json()["id"]

    filtered_false_res = client.get("/bank-accounts?allow_payments=false")
    assert filtered_false_res.status_code == 200
    filtered_false = filtered_false_res.json()
    assert len(filtered_false) == 1
    assert filtered_false[0]["id"] == second_res.json()["id"]


def test_patrimony_snapshots_are_created_and_listed(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    create_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Snapshot",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
        },
    )
    assert create_res.status_code == 201
    account_id = create_res.json()["id"]

    update_res = client.patch(
        f"/bank-accounts/{account_id}",
        json={"total_value": "250.00"},
    )
    assert update_res.status_code == 200

    list_res = client.get("/bank-accounts/patrimony-snapshots")
    assert list_res.status_code == 200
    snapshots = list_res.json()
    assert len(snapshots) >= 2
    assert all("snapshot_at" in snapshot for snapshot in snapshots)
    assert snapshots[-1]["total_value"] == "250.00"
    assert snapshots[-1]["has_breakdown"] is True
    assert snapshots[-1]["accounts"] == [
        {
            "bank_account_id": account_id,
            "account_name": "Conta Snapshot",
            "total_value": "250.00",
        }
    ]


def test_patrimony_snapshots_include_multiple_accounts_breakdown(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    first_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Corrente",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
        },
    )
    assert first_res.status_code == 201

    second_res = client.post(
        "/bank-accounts",
        json={
            "name": "Reserva",
            "objective_dream_id": dream_id,
            "total_value": "50.00",
        },
    )
    assert second_res.status_code == 201

    snapshots_res = client.get("/bank-accounts/patrimony-snapshots")
    assert snapshots_res.status_code == 200
    latest = snapshots_res.json()[-1]

    assert latest["total_value"] == "150.00"
    assert latest["has_breakdown"] is True
    assert latest["accounts"] == [
        {
            "bank_account_id": first_res.json()["id"],
            "account_name": "Conta Corrente",
            "total_value": "100.00",
        },
        {
            "bank_account_id": second_res.json()["id"],
            "account_name": "Reserva",
            "total_value": "50.00",
        },
    ]


def test_patrimony_snapshot_after_delete_has_zero_total(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Objetivo para zerar",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    create_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta a remover",
            "objective_dream_id": dream_id,
            "total_value": "500.00",
        },
    )
    assert create_res.status_code == 201
    account_id = create_res.json()["id"]

    delete_res = client.delete(f"/bank-accounts/{account_id}")
    assert delete_res.status_code == 204

    snapshots_res = client.get("/bank-accounts/patrimony-snapshots")
    assert snapshots_res.status_code == 200
    snapshots = snapshots_res.json()
    assert len(snapshots) >= 2
    assert snapshots[-1]["total_value"] == "0.00"


def test_patrimony_snapshots_days_validation(client: TestClient):
    low_days_res = client.get("/bank-accounts/patrimony-snapshots?days=6")
    assert low_days_res.status_code == 400
    assert low_days_res.json()["detail"] == "days must be between 7 and 3650"

    high_days_res = client.get("/bank-accounts/patrimony-snapshots?days=3651")
    assert high_days_res.status_code == 400
    assert high_days_res.json()["detail"] == "days must be between 7 and 3650"


def test_transfer_between_bank_accounts_updates_balances(
    client: TestClient, db_session
):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    origin_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Corrente",
            "objective_dream_id": dream_id,
            "total_value": "1000.00",
        },
    )
    assert origin_res.status_code == 201

    destination_res = client.post(
        "/bank-accounts",
        json={
            "name": "Reserva de Emergência",
            "objective_dream_id": dream_id,
            "total_value": "250.00",
        },
    )
    assert destination_res.status_code == 201

    transfer_res = client.post(
        "/bank-accounts/transfer",
        json={
            "from_account_id": origin_res.json()["id"],
            "to_account_id": destination_res.json()["id"],
            "amount": "300.00",
        },
    )
    assert transfer_res.status_code == 200
    payload = transfer_res.json()
    assert payload["transferred_amount"] == "300.00"
    assert payload["from_account"]["total_value"] == "700.00"
    assert payload["to_account"]["total_value"] == "550.00"

    list_res = client.get("/bank-accounts")
    assert list_res.status_code == 200
    accounts = {item["id"]: item for item in list_res.json()}
    assert accounts[origin_res.json()["id"]]["total_value"] == "700.00"
    assert accounts[destination_res.json()["id"]]["total_value"] == "550.00"

    transfers = db_session.query(BankAccountTransfer).all()
    assert len(transfers) == 1
    assert str(transfers[0].amount) == "300.00"

    transactions = (
        db_session.query(BankAccountTransaction)
        .order_by(BankAccountTransaction.id.asc())
        .all()
    )
    assert len(transactions) == 4
    assert [str(item.amount) for item in transactions] == [
        "1000.00",
        "250.00",
        "-300.00",
        "300.00",
    ]
    assert transactions[2].transfer_id == transfers[0].id
    assert transactions[3].transfer_id == transfers[0].id


def test_transfer_between_bank_accounts_requires_sufficient_balance(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    origin_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Corrente",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
        },
    )
    assert origin_res.status_code == 201

    destination_res = client.post(
        "/bank-accounts",
        json={
            "name": "Poupança",
            "objective_dream_id": dream_id,
            "total_value": "50.00",
        },
    )
    assert destination_res.status_code == 201

    transfer_res = client.post(
        "/bank-accounts/transfer",
        json={
            "from_account_id": origin_res.json()["id"],
            "to_account_id": destination_res.json()["id"],
            "amount": "150.00",
        },
    )
    assert transfer_res.status_code == 400
    assert transfer_res.json()["detail"] == "Saldo insuficiente na conta de origem"


def test_transfer_between_bank_accounts_requires_different_accounts(client: TestClient):
    dream_res = client.post(
        "/dreams",
        json={
            "title": "Reserva",
            "milestones": [],
        },
    )
    assert dream_res.status_code == 201
    dream_id = dream_res.json()["id"]

    account_res = client.post(
        "/bank-accounts",
        json={
            "name": "Conta Única",
            "objective_dream_id": dream_id,
            "total_value": "100.00",
        },
    )
    assert account_res.status_code == 201

    transfer_res = client.post(
        "/bank-accounts/transfer",
        json={
            "from_account_id": account_res.json()["id"],
            "to_account_id": account_res.json()["id"],
            "amount": "10.00",
        },
    )
    assert transfer_res.status_code == 400
    assert (
        transfer_res.json()["detail"]
        == "Selecione contas diferentes para a transferência"
    )
