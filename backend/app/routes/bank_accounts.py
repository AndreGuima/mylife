from datetime import datetime, timedelta

from core.dependencies import get_current_user
from database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from models.bank_account import BankAccount
from models.bank_account_transaction import BankAccountTransaction, TransactionType
from models.bank_account_transfer import BankAccountTransfer as BankAccountTransferModel
from models.dream import Dream
from models.patrimony_snapshot import PatrimonySnapshot
from models.user import User
from schemas.bank_account import (
    BankAccountCreate,
    BankAccountRead,
    BankAccountStatementRead,
    BankAccountTransactionRead,
    BankAccountTransfer,
    BankAccountTransferRead,
    BankAccountUpdate,
    PatrimonySnapshotRead,
)
from services.bank_account_ledger import apply_account_delta, to_money_decimal
from services.dream_financial_progress import sync_dream_milestone_financial_progress
from services.idempotency import begin_idempotent_request, finalize_idempotent_request
from services.patrimony_snapshot_service import capture_patrimony_snapshot
from services.transaction_scope import transaction_scope
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

router = APIRouter(prefix="/bank-accounts", tags=["Bank Accounts"])


def _to_response(account: BankAccount) -> BankAccountRead:
    return BankAccountRead(
        id=account.id,
        name=account.name,
        objective_dream_id=account.objective_dream_id,
        objective_dream_title=account.objective_dream.title,
        total_value=account.total_value,
        allow_investment_income=bool(account.allow_investment_income),
        allow_payments=bool(account.allow_payments),
        created_at=account.created_at,
        updated_at=account.updated_at,
    )


def _validate_dream_belongs_to_user(db: Session, user_id: int, dream_id: int) -> Dream:
    dream = (
        db.query(Dream)
        .filter(
            Dream.id == dream_id,
            Dream.user_id == user_id,
        )
        .first()
    )
    if not dream:
        raise HTTPException(status_code=400, detail="Objetivo inválido")
    return dream


def _get_user_account_or_404(
    db: Session, user_id: int, account_id: int, *, for_update: bool = False
) -> BankAccount:
    account = (
        db.query(BankAccount)
        .options(joinedload(BankAccount.objective_dream))
        .filter(BankAccount.id == account_id, BankAccount.user_id == user_id)
    )
    if for_update:
        account = account.with_for_update()
    account = account.first()
    if not account:
        raise HTTPException(status_code=404, detail="Conta bancária não encontrada")
    return account


@router.get("", response_model=list[BankAccountRead])
def list_accounts(
    allow_investment_income: bool | None = Query(default=None),
    allow_payments: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        db.query(BankAccount)
        .options(joinedload(BankAccount.objective_dream))
        .filter(BankAccount.user_id == user.id)
    )
    if allow_investment_income is not None:
        query = query.filter(
            BankAccount.allow_investment_income.is_(allow_investment_income)
        )
    if allow_payments is not None:
        query = query.filter(BankAccount.allow_payments.is_(allow_payments))

    accounts = query.order_by(
        BankAccount.created_at.desc(), BankAccount.id.desc()
    ).all()
    return [_to_response(account) for account in accounts]


@router.get("/{account_id}/statement", response_model=BankAccountStatementRead)
def get_account_statement(
    account_id: int,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = _get_user_account_or_404(db, user.id, account_id)

    running_balance = func.sum(BankAccountTransaction.amount).over(
        partition_by=BankAccountTransaction.account_id,
        order_by=(
            BankAccountTransaction.created_at.asc(),
            BankAccountTransaction.id.asc(),
        ),
    )
    query = db.query(
        BankAccountTransaction.id.label("id"),
        BankAccountTransaction.transfer_id.label("transfer_id"),
        BankAccountTransaction.amount.label("amount"),
        BankAccountTransaction.transaction_type.label("transaction_type"),
        BankAccountTransaction.description.label("description"),
        BankAccountTransaction.created_at.label("created_at"),
        running_balance.label("balance_after"),
    ).filter(
        BankAccountTransaction.user_id == user.id,
        BankAccountTransaction.account_id == account_id,
    )
    total = query.count()
    if order == "asc":
        query = query.order_by(
            BankAccountTransaction.created_at.asc(),
            BankAccountTransaction.id.asc(),
        )
    else:
        query = query.order_by(
            BankAccountTransaction.created_at.desc(),
            BankAccountTransaction.id.desc(),
        )
    rows = query.offset(offset).limit(limit).all()

    return BankAccountStatementRead(
        account=_to_response(account),
        items=[
            BankAccountTransactionRead(
                id=row.id,
                transfer_id=row.transfer_id,
                amount=row.amount,
                transaction_type=row.transaction_type.value,
                description=row.description,
                created_at=row.created_at,
                balance_after=row.balance_after,
            )
            for row in rows
        ],
        limit=limit,
        offset=offset,
        total=total,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BankAccountRead)
def create_account(
    payload: BankAccountCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    with transaction_scope(db):
        dream = _validate_dream_belongs_to_user(db, user.id, payload.objective_dream_id)

        account = BankAccount(
            user_id=user.id,
            name=payload.name.strip(),
            objective_dream_id=dream.id,
            total_value=to_money_decimal("0.00"),
            allow_investment_income=bool(payload.allow_investment_income),
            allow_payments=bool(payload.allow_payments),
        )

        if not account.name:
            raise HTTPException(status_code=400, detail="Nome é obrigatório")

        db.add(account)
        db.flush()
        apply_account_delta(
            db,
            user_id=user.id,
            account=account,
            delta=to_money_decimal(payload.total_value),
            transaction_type=TransactionType.OPENING_BALANCE,
            description="Saldo inicial da conta",
        )
        sync_dream_milestone_financial_progress(db, user.id, account.objective_dream_id)
        capture_patrimony_snapshot(db, user.id)

    db.commit()
    account = _get_user_account_or_404(db, user.id, account.id)
    return _to_response(account)


@router.post("/transfer", response_model=BankAccountTransferRead)
def transfer_between_accounts(
    payload: BankAccountTransfer,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(
            status_code=400,
            detail="Selecione contas diferentes para a transferência",
        )

    amount = to_money_decimal(payload.amount)
    record, replay_response = begin_idempotent_request(
        db,
        user_id=user.id,
        route_key="bank_accounts.transfer",
        idempotency_key=idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    if replay_response is not None:
        return replay_response

    with transaction_scope(db):
        from_account = _get_user_account_or_404(
            db, user.id, payload.from_account_id, for_update=True
        )
        to_account = _get_user_account_or_404(
            db, user.id, payload.to_account_id, for_update=True
        )
        transfer = BankAccountTransferModel(
            user_id=user.id,
            from_account_id=from_account.id,
            to_account_id=to_account.id,
            amount=amount,
            description=f"Transferência de {from_account.name} para {to_account.name}",
        )
        db.add(transfer)
        db.flush()

        try:
            apply_account_delta(
                db,
                user_id=user.id,
                account=from_account,
                delta=-amount,
                transaction_type=TransactionType.TRANSFER,
                description=f"Transferência para {to_account.name}",
                transfer_id=transfer.id,
            )
        except HTTPException as exc:
            if exc.detail == "Saldo insuficiente na conta":
                raise HTTPException(
                    status_code=400,
                    detail="Saldo insuficiente na conta de origem",
                ) from exc
            raise
        apply_account_delta(
            db,
            user_id=user.id,
            account=to_account,
            delta=amount,
            transaction_type=TransactionType.TRANSFER,
            description=f"Transferência recebida de {from_account.name}",
            transfer_id=transfer.id,
        )

        db.flush()
        sync_dream_milestone_financial_progress(
            db, user.id, from_account.objective_dream_id
        )
        if from_account.objective_dream_id != to_account.objective_dream_id:
            sync_dream_milestone_financial_progress(
                db, user.id, to_account.objective_dream_id
            )
        capture_patrimony_snapshot(db, user.id)

    updated_from_account = _get_user_account_or_404(db, user.id, from_account.id)
    updated_to_account = _get_user_account_or_404(db, user.id, to_account.id)
    response = BankAccountTransferRead(
        transferred_amount=amount,
        from_account=_to_response(updated_from_account),
        to_account=_to_response(updated_to_account),
    )
    with transaction_scope(db):
        finalize_idempotent_request(
            db,
            record=record,
            response_body=response.model_dump(mode="json"),
            status_code=200,
        )
    db.commit()
    if record is not None:
        return JSONResponse(status_code=200, content=response.model_dump(mode="json"))
    return response


@router.patch("/{account_id}", response_model=BankAccountRead)
def update_account(
    account_id: int,
    payload: BankAccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    with transaction_scope(db):
        account = _get_user_account_or_404(db, user.id, account_id)
        previous_dream_id = account.objective_dream_id

        if payload.name is not None:
            clean_name = payload.name.strip()
            if not clean_name:
                raise HTTPException(status_code=400, detail="Nome é obrigatório")
            account.name = clean_name

        if payload.objective_dream_id is not None:
            dream = _validate_dream_belongs_to_user(
                db, user.id, payload.objective_dream_id
            )
            account.objective_dream_id = dream.id

        if payload.total_value is not None:
            current_total = to_money_decimal(account.total_value)
            next_total = to_money_decimal(payload.total_value)
            delta = next_total - current_total
            # Use a positive incoming transaction type when the value increases
            # so frontend can display 'entradas' (incomings) separately.
            tx_type = (
                TransactionType.INVESTMENT_INCOME
                if delta > 0
                else TransactionType.MANUAL_ADJUSTMENT
            )
            apply_account_delta(
                db,
                user_id=user.id,
                account=account,
                delta=delta,
                transaction_type=tx_type,
                description="Ajuste manual de saldo",
            )
        if payload.allow_investment_income is not None:
            account.allow_investment_income = bool(payload.allow_investment_income)
        if payload.allow_payments is not None:
            account.allow_payments = bool(payload.allow_payments)

        db.flush()
        sync_dream_milestone_financial_progress(db, user.id, account.objective_dream_id)
        if previous_dream_id != account.objective_dream_id:
            sync_dream_milestone_financial_progress(db, user.id, previous_dream_id)
        capture_patrimony_snapshot(db, user.id)

    db.commit()
    account = _get_user_account_or_404(db, user.id, account.id)
    return _to_response(account)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    with transaction_scope(db):
        account = _get_user_account_or_404(db, user.id, account_id)
        dream_id = account.objective_dream_id
        db.delete(account)
        db.flush()
        sync_dream_milestone_financial_progress(db, user.id, dream_id)
        capture_patrimony_snapshot(db, user.id)
    db.commit()
    return None


@router.get("/patrimony-snapshots", response_model=list[PatrimonySnapshotRead])
def list_patrimony_snapshots(
    days: int = 365,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if days < 7 or days > 3650:
        raise HTTPException(
            status_code=400,
            detail="days must be between 7 and 3650",
        )

    from_dt = datetime.now() - timedelta(days=days - 1)
    snapshots = (
        db.query(PatrimonySnapshot)
        .options(selectinload(PatrimonySnapshot.accounts))
        .filter(
            PatrimonySnapshot.user_id == user.id,
            PatrimonySnapshot.snapshot_at >= from_dt,
        )
        .order_by(PatrimonySnapshot.snapshot_at.asc(), PatrimonySnapshot.id.asc())
        .all()
    )
    return snapshots
