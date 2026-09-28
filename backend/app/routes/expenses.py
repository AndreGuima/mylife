from datetime import date, datetime, timedelta
from decimal import Decimal

from core.dependencies import get_current_user
from database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import JSONResponse
from models.bank_account import BankAccount
from models.bank_account_transaction import TransactionType
from models.credit_card import CreditCard
from models.expense import Expense
from models.expense_category import ExpenseCategory
from models.user import User
from schemas.expense import (
    ExpenseCreate,
    ExpenseRead,
    ExpenseSummaryCategoryRead,
    ExpenseSummaryRead,
    ExpenseUpdate,
    PayCreditInvoiceRequest,
    PayCreditInvoiceResponse,
)
from services.bank_account_ledger import apply_account_delta, to_money_decimal
from services.dream_financial_progress import sync_dream_milestone_financial_progress
from services.idempotency import begin_idempotent_request, finalize_idempotent_request
from services.patrimony_snapshot_service import capture_patrimony_snapshot
from services.transaction_scope import transaction_scope
from sqlalchemy import case, func, select
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session, aliased, joinedload

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _to_response(expense: Expense) -> ExpenseRead:
    return ExpenseRead(
        id=expense.id,
        value=expense.value,
        description=expense.description,
        expense_category_id=expense.expense_category_id,
        expense_category_name=expense.expense_category.name,
        payment_method=expense.payment_method,
        bank_account_id=expense.bank_account_id,
        bank_account_name=expense.bank_account.name if expense.bank_account else None,
        credit_card_id=expense.credit_card_id,
        credit_card_name=expense.credit_card.name if expense.credit_card else None,
        invoice_payment_expense_id=expense.invoice_payment_expense_id,
        launch_date=expense.launch_date,
        invoice_paid_at=expense.invoice_paid_at,
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def _get_user_expense_or_404(db: Session, user_id: int, expense_id: int) -> Expense:
    expense = (
        db.query(Expense)
        .options(
            joinedload(Expense.bank_account),
            joinedload(Expense.credit_card),
            joinedload(Expense.expense_category),
        )
        .filter(Expense.id == expense_id, Expense.user_id == user_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return expense


def _validate_account_belongs_to_user(
    db: Session,
    user_id: int,
    account_id: int,
    *,
    require_payments_enabled: bool = False,
) -> None:
    account = (
        db.query(BankAccount)
        .filter(BankAccount.id == account_id, BankAccount.user_id == user_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=400, detail="Conta bancária inválida")
    if require_payments_enabled and not bool(account.allow_payments):
        raise HTTPException(
            status_code=400,
            detail="Conta não habilitada para lançamento de despesas",
        )


def _get_user_account_or_400(
    db: Session,
    user_id: int,
    account_id: int | None,
    *,
    for_update: bool = False,
    require_payments_enabled: bool = False,
) -> BankAccount:
    if account_id is None:
        raise HTTPException(status_code=400, detail="Conta bancária inválida")
    query = db.query(BankAccount).filter(
        BankAccount.id == account_id, BankAccount.user_id == user_id
    )
    if for_update:
        query = query.with_for_update()
    account = query.first()
    if not account:
        raise HTTPException(status_code=400, detail="Conta bancária inválida")
    if require_payments_enabled and not bool(account.allow_payments):
        raise HTTPException(
            status_code=400,
            detail="Conta não habilitada para lançamento de despesas",
        )
    return account


def _validate_card_belongs_to_user(db: Session, user_id: int, card_id: int) -> None:
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == card_id, CreditCard.user_id == user_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=400, detail="Cartão inválido")


def _get_user_card_or_400(db: Session, user_id: int, card_id: int) -> CreditCard:
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == card_id, CreditCard.user_id == user_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=400, detail="Cartão inválido")
    return card


def _validate_category_belongs_to_user(
    db: Session,
    user_id: int,
    category_id: int,
) -> None:
    category = (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.id == category_id, ExpenseCategory.user_id == user_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=400, detail="Categoria inválida")


def _get_or_create_invoice_payment_category(
    db: Session,
    user_id: int,
) -> ExpenseCategory:
    category = (
        db.query(ExpenseCategory)
        .filter(
            ExpenseCategory.user_id == user_id,
            ExpenseCategory.name == "Pagamento de Fatura",
        )
        .first()
    )
    if category:
        return category

    category = ExpenseCategory(user_id=user_id, name="Pagamento de Fatura")
    db.add(category)
    db.flush()
    return category


def _apply_expense_filters(
    *,
    query: SAQuery,
    db: Session,
    user_id: int,
    year: int | None,
    month: int | None,
    from_date: date | None,
    to_date: date | None,
    category_id: int | None,
) -> SAQuery:
    if month is not None and year is None:
        raise HTTPException(
            status_code=400, detail="year is required when month is provided"
        )

    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=400, detail="'from' must be less than or equal to 'to'"
        )

    if category_id is not None:
        _validate_category_belongs_to_user(db, user_id, category_id)

    query = query.filter(Expense.user_id == user_id)

    if year is not None and month is None:
        query = query.filter(Expense.launch_date >= date(year, 1, 1))
        query = query.filter(Expense.launch_date <= date(year, 12, 31))

    if year is not None and month is not None:
        period_start = date(year, month, 1)
        if month == 12:
            period_end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            period_end = date(year, month + 1, 1) - timedelta(days=1)
        query = query.filter(Expense.launch_date >= period_start)
        query = query.filter(Expense.launch_date <= period_end)

    if from_date is not None:
        query = query.filter(Expense.launch_date >= from_date)

    if to_date is not None:
        query = query.filter(Expense.launch_date <= to_date)

    if category_id is not None:
        query = query.filter(Expense.expense_category_id == category_id)

    return query


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    year: int | None = Query(default=None, ge=1900, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    category_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Expense).options(
        joinedload(Expense.bank_account),
        joinedload(Expense.credit_card),
        joinedload(Expense.expense_category),
    )
    query = _apply_expense_filters(
        query=query,
        db=db,
        user_id=user.id,
        year=year,
        month=month,
        from_date=from_date,
        to_date=to_date,
        category_id=category_id,
    )
    expenses = (
        query.order_by(Expense.launch_date.desc(), Expense.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [_to_response(expense) for expense in expenses]


@router.get("/summary", response_model=ExpenseSummaryRead)
def get_expenses_summary(
    year: int | None = Query(default=None, ge=1900, le=9999),
    month: int | None = Query(default=None, ge=1, le=12),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    category_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    paid_expense = aliased(Expense)
    invoice_payment_ids_subquery = (
        db.query(paid_expense.invoice_payment_expense_id)
        .filter(
            paid_expense.user_id == user.id,
            paid_expense.invoice_payment_expense_id.isnot(None),
        )
        .subquery()
    )

    base_query = _apply_expense_filters(
        query=db.query(Expense),
        db=db,
        user_id=user.id,
        year=year,
        month=month,
        from_date=from_date,
        to_date=to_date,
        category_id=category_id,
    )
    base_query = base_query.filter(
        ~Expense.id.in_(
            select(invoice_payment_ids_subquery.c.invoice_payment_expense_id)
        )
    )

    summary_row = base_query.with_entities(
        func.coalesce(func.sum(Expense.value), 0),
        func.coalesce(func.avg(Expense.value), 0),
        func.count(Expense.id),
        func.coalesce(
            func.sum(
                case((Expense.payment_method == "credit", Expense.value), else_=0)
            ),
            0,
        ),
        func.coalesce(
            func.sum(case((Expense.payment_method == "debit", Expense.value), else_=0)),
            0,
        ),
    ).one()

    by_category_rows = (
        base_query.join(
            ExpenseCategory, ExpenseCategory.id == Expense.expense_category_id
        )
        .with_entities(
            Expense.expense_category_id,
            ExpenseCategory.name,
            func.coalesce(func.sum(Expense.value), 0),
            func.count(Expense.id),
        )
        .group_by(Expense.expense_category_id, ExpenseCategory.name)
        .order_by(func.sum(Expense.value).desc(), func.count(Expense.id).desc())
        .all()
    )

    by_category = [
        ExpenseSummaryCategoryRead(
            category_id=row[0],
            category_name=row[1],
            total=to_money_decimal(row[2]),
            count=row[3],
        )
        for row in by_category_rows
    ]

    return ExpenseSummaryRead(
        total=to_money_decimal(summary_row[0]),
        average=to_money_decimal(summary_row[1]),
        count=summary_row[2],
        credit_total=to_money_decimal(summary_row[3]),
        debit_total=to_money_decimal(summary_row[4]),
        by_category=by_category,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ExpenseRead)
def create_expense(
    payload: ExpenseCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    record, replay_response = begin_idempotent_request(
        db,
        user_id=user.id,
        route_key="expenses.create",
        idempotency_key=idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    if replay_response is not None:
        return replay_response

    with transaction_scope(db):
        _validate_category_belongs_to_user(db, user.id, payload.expense_category_id)
        touched_dream_ids: set[int] = set()

        if payload.payment_method == "debit":
            account = _get_user_account_or_400(
                db,
                user.id,
                payload.bank_account_id,
                for_update=True,
                require_payments_enabled=True,
            )
            apply_account_delta(
                db,
                user_id=user.id,
                account=account,
                delta=-to_money_decimal(payload.value),
                transaction_type=TransactionType.EXPENSE,
                description=f"Despesa: {payload.description.strip()}",
            )
            if account.objective_dream_id is not None:
                touched_dream_ids.add(account.objective_dream_id)

        if payload.payment_method == "credit":
            _validate_card_belongs_to_user(db, user.id, payload.credit_card_id)

        expense = Expense(
            user_id=user.id,
            value=payload.value,
            description=payload.description.strip(),
            expense_category_id=payload.expense_category_id,
            payment_method=payload.payment_method,
            bank_account_id=payload.bank_account_id,
            credit_card_id=payload.credit_card_id,
            launch_date=payload.launch_date,
        )

        if not expense.description:
            raise HTTPException(status_code=400, detail="Descrição é obrigatória")

        db.add(expense)
        db.flush()
        for dream_id in touched_dream_ids:
            sync_dream_milestone_financial_progress(db, user.id, dream_id)
        if touched_dream_ids:
            capture_patrimony_snapshot(db, user.id)
    db.expire_all()

    created = _get_user_expense_or_404(db, user.id, expense.id)
    response = _to_response(created)
    with transaction_scope(db):
        finalize_idempotent_request(
            db,
            record=record,
            response_body=response.model_dump(mode="json"),
            status_code=201,
        )
    db.commit()
    if record is not None:
        return JSONResponse(status_code=201, content=response.model_dump(mode="json"))
    return response


@router.patch("/{expense_id}", response_model=ExpenseRead)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    with transaction_scope(db):
        expense = _get_user_expense_or_404(db, user.id, expense_id)
        previous_payment_method = expense.payment_method
        previous_bank_account_id = expense.bank_account_id
        previous_value = to_money_decimal(expense.value)

        next_payment_method = payload.payment_method or expense.payment_method
        next_expense_category_id = (
            payload.expense_category_id
            if payload.expense_category_id is not None
            else expense.expense_category_id
        )
        next_bank_account_id = (
            payload.bank_account_id
            if payload.bank_account_id is not None
            else expense.bank_account_id
        )
        next_credit_card_id = (
            payload.credit_card_id
            if payload.credit_card_id is not None
            else expense.credit_card_id
        )

        if next_payment_method == "debit":
            if next_bank_account_id is None:
                raise HTTPException(
                    status_code=400, detail="bank_account_id é obrigatório para débito"
                )
            next_credit_card_id = None
            _validate_account_belongs_to_user(
                db,
                user.id,
                next_bank_account_id,
                require_payments_enabled=True,
            )

        if next_payment_method == "credit":
            if next_credit_card_id is None:
                raise HTTPException(
                    status_code=400, detail="credit_card_id é obrigatório para crédito"
                )
            next_bank_account_id = None
            _validate_card_belongs_to_user(db, user.id, next_credit_card_id)

        _validate_category_belongs_to_user(db, user.id, next_expense_category_id)

        next_value = (
            to_money_decimal(payload.value)
            if payload.value is not None
            else to_money_decimal(expense.value)
        )
        account_deltas: dict[int, Decimal] = {}
        if previous_payment_method == "debit" and previous_bank_account_id is not None:
            account_deltas[previous_bank_account_id] = (
                account_deltas.get(previous_bank_account_id, Decimal("0"))
                + previous_value
            )
        if next_payment_method == "debit" and next_bank_account_id is not None:
            account_deltas[next_bank_account_id] = (
                account_deltas.get(next_bank_account_id, Decimal("0")) - next_value
            )

        touched_dream_ids: set[int] = set()
        for account_id, delta in account_deltas.items():
            account = _get_user_account_or_400(db, user.id, account_id, for_update=True)
            apply_account_delta(
                db,
                user_id=user.id,
                account=account,
                delta=delta,
                transaction_type=TransactionType.EXPENSE_ADJUSTMENT,
                description=f"Ajuste da despesa #{expense.id}",
            )
            if account.objective_dream_id is not None:
                touched_dream_ids.add(account.objective_dream_id)

        if payload.value is not None:
            expense.value = payload.value
        if payload.description is not None:
            clean_description = payload.description.strip()
            if not clean_description:
                raise HTTPException(status_code=400, detail="Descrição é obrigatória")
            expense.description = clean_description
        if payload.launch_date is not None:
            expense.launch_date = payload.launch_date

        expense.expense_category_id = next_expense_category_id
        expense.payment_method = next_payment_method
        expense.bank_account_id = next_bank_account_id
        expense.credit_card_id = next_credit_card_id

        db.flush()
        for dream_id in touched_dream_ids:
            sync_dream_milestone_financial_progress(db, user.id, dream_id)
        if touched_dream_ids:
            capture_patrimony_snapshot(db, user.id)
    db.expire_all()

    db.commit()
    updated = _get_user_expense_or_404(db, user.id, expense_id)
    return _to_response(updated)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    with transaction_scope(db):
        expense = _get_user_expense_or_404(db, user.id, expense_id)
        touched_dream_ids: set[int] = set()

        if expense.payment_method == "debit" and expense.bank_account_id is not None:
            account = _get_user_account_or_400(
                db, user.id, expense.bank_account_id, for_update=True
            )
            apply_account_delta(
                db,
                user_id=user.id,
                account=account,
                delta=to_money_decimal(expense.value),
                transaction_type=TransactionType.EXPENSE_REVERSAL,
                description=f"Estorno da despesa #{expense.id}",
            )
            if account.objective_dream_id is not None:
                touched_dream_ids.add(account.objective_dream_id)

        db.delete(expense)
        db.flush()
        for dream_id in touched_dream_ids:
            sync_dream_milestone_financial_progress(db, user.id, dream_id)
        if touched_dream_ids:
            capture_patrimony_snapshot(db, user.id)
    db.commit()
    return None


@router.post("/pay-credit-invoice", response_model=PayCreditInvoiceResponse)
def pay_credit_invoice(
    payload: PayCreditInvoiceRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    unique_expense_ids = list(dict.fromkeys(payload.expense_ids))
    if len(unique_expense_ids) == 0:
        raise HTTPException(
            status_code=400, detail="Informe ao menos uma despesa para pagar"
        )
    record, replay_response = begin_idempotent_request(
        db,
        user_id=user.id,
        route_key="expenses.pay_credit_invoice",
        idempotency_key=idempotency_key,
        payload={**payload.model_dump(mode="json"), "expense_ids": unique_expense_ids},
    )
    if replay_response is not None:
        return replay_response

    with transaction_scope(db):
        card = _get_user_card_or_400(db, user.id, payload.credit_card_id)
        account = _get_user_account_or_400(
            db,
            user.id,
            payload.bank_account_id,
            for_update=True,
            require_payments_enabled=True,
        )

        expenses = (
            db.query(Expense)
            .options(
                joinedload(Expense.bank_account),
                joinedload(Expense.credit_card),
                joinedload(Expense.expense_category),
            )
            .filter(
                Expense.user_id == user.id,
                Expense.id.in_(unique_expense_ids),
            )
            .with_for_update()
            .all()
        )
        if len(expenses) != len(unique_expense_ids):
            raise HTTPException(status_code=400, detail="Despesa inválida na seleção")

        for expense in expenses:
            if expense.payment_method != "credit":
                raise HTTPException(
                    status_code=400,
                    detail="Apenas despesas no crédito podem ser pagas na fatura",
                )
            if expense.credit_card_id != payload.credit_card_id:
                raise HTTPException(
                    status_code=400,
                    detail="Todas as despesas devem pertencer ao cartão selecionado",
                )
            if expense.invoice_paid_at is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Existe despesa já vinculada a uma fatura paga",
                )

        total_paid = to_money_decimal(
            sum(to_money_decimal(exp.value) for exp in expenses)
        )
        if total_paid <= Decimal("0"):
            raise HTTPException(
                status_code=400, detail="Valor total da fatura inválido"
            )

        apply_account_delta(
            db,
            user_id=user.id,
            account=account,
            delta=-total_paid,
            transaction_type=TransactionType.INVOICE_PAYMENT,
            description=f"Pagamento de fatura - {card.name}",
        )

        if payload.expense_category_id is not None:
            _validate_category_belongs_to_user(db, user.id, payload.expense_category_id)
            payment_category_id = payload.expense_category_id
        else:
            payment_category = _get_or_create_invoice_payment_category(db, user.id)
            payment_category_id = payment_category.id

        payment_description = (
            payload.description.strip()
            if payload.description is not None
            else f"Pagamento de fatura - {card.name}"
        )
        if not payment_description:
            raise HTTPException(status_code=400, detail="Descrição é obrigatória")

        payment_expense = Expense(
            user_id=user.id,
            value=total_paid,
            description=payment_description,
            expense_category_id=payment_category_id,
            payment_method="debit",
            bank_account_id=payload.bank_account_id,
            credit_card_id=None,
            launch_date=payload.launch_date,
        )
        db.add(payment_expense)
        db.flush()

        now = datetime.utcnow()
        for expense in expenses:
            expense.invoice_paid_at = now
            expense.invoice_payment_expense_id = payment_expense.id

        touched_dream_ids: set[int] = set()
        if account.objective_dream_id is not None:
            touched_dream_ids.add(account.objective_dream_id)

        for dream_id in touched_dream_ids:
            sync_dream_milestone_financial_progress(db, user.id, dream_id)
        if touched_dream_ids:
            capture_patrimony_snapshot(db, user.id)
    db.expire_all()

    created = _get_user_expense_or_404(db, user.id, payment_expense.id)
    response = PayCreditInvoiceResponse(
        payment_expense=_to_response(created),
        paid_expense_ids=sorted(unique_expense_ids),
        total_paid=total_paid,
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
