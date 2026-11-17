from datetime import date, timedelta
from decimal import Decimal

from core.dependencies import get_current_user
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, status
from models.credit_card import CreditCard
from models.credit_card_spending_limit import CreditCardSpendingLimit
from models.expense import Expense
from models.user import User
from schemas.credit_card import (
    CreditCardCreate,
    CreditCardCycleDashboardRead,
    CreditCardCycleDayPoint,
    CreditCardRead,
    CreditCardSettingsRead,
    CreditCardSettingsUpdate,
    CreditCardSpendingLimitItem,
    CreditCardUpdate,
)
from services.credit_card_cycle import (
    build_planned_anchors,
    build_timeline,
    compute_cycle,
    compute_due_date,
    planned_value_at,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

router = APIRouter(prefix="/credit-cards", tags=["Credit Cards"])


def _to_response(card: CreditCard) -> CreditCardRead:
    return CreditCardRead(
        id=card.id,
        name=card.name,
        due_day=card.due_day,
        closing_day=card.closing_day,
        created_at=card.created_at,
        updated_at=card.updated_at,
    )


def _get_user_card_or_404(db: Session, user_id: int, card_id: int) -> CreditCard:
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == card_id, CreditCard.user_id == user_id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Cartão não encontrado")
    return card


@router.get("", response_model=list[CreditCardRead])
def list_credit_cards(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cards = (
        db.query(CreditCard)
        .filter(CreditCard.user_id == user.id)
        .order_by(CreditCard.created_at.desc(), CreditCard.id.desc())
        .all()
    )
    return [_to_response(card) for card in cards]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=CreditCardRead)
def create_credit_card(
    payload: CreditCardCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Nome é obrigatório")
    exists = (
        db.query(CreditCard)
        .filter(CreditCard.user_id == user.id, CreditCard.name == clean_name)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Cartão já existe")

    card = CreditCard(user_id=user.id, name=clean_name)
    db.add(card)
    db.commit()

    created = _get_user_card_or_404(db, user.id, card.id)
    return _to_response(created)


@router.patch("/{card_id}", response_model=CreditCardRead)
def update_credit_card(
    card_id: int,
    payload: CreditCardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    card = _get_user_card_or_404(db, user.id, card_id)

    if payload.name is not None:
        clean_name = payload.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Nome é obrigatório")
        exists = (
            db.query(CreditCard)
            .filter(
                CreditCard.user_id == user.id,
                CreditCard.name == clean_name,
                CreditCard.id != card_id,
            )
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="Cartão já existe")
        card.name = clean_name

    db.commit()

    updated = _get_user_card_or_404(db, user.id, card_id)
    return _to_response(updated)


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_credit_card(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    card = _get_user_card_or_404(db, user.id, card_id)
    db.delete(card)
    db.commit()
    return None


def _load_limits(db: Session, card_id: int) -> list[CreditCardSpendingLimit]:
    return (
        db.query(CreditCardSpendingLimit)
        .filter(CreditCardSpendingLimit.credit_card_id == card_id)
        .order_by(CreditCardSpendingLimit.day_of_month.asc())
        .all()
    )


def _to_settings_response(
    card: CreditCard, limits: list[CreditCardSpendingLimit]
) -> CreditCardSettingsRead:
    return CreditCardSettingsRead(
        credit_card_id=card.id,
        due_day=card.due_day,
        closing_day=card.closing_day,
        limits=[
            CreditCardSpendingLimitItem(
                day_of_month=item.day_of_month, limit_amount=item.limit_amount
            )
            for item in limits
        ],
    )


@router.get("/{card_id}/settings", response_model=CreditCardSettingsRead)
def get_credit_card_settings(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    card = _get_user_card_or_404(db, user.id, card_id)
    return _to_settings_response(card, _load_limits(db, card.id))


@router.put("/{card_id}/settings", response_model=CreditCardSettingsRead)
def update_credit_card_settings(
    card_id: int,
    payload: CreditCardSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Replace the card's due day and its full list of spending limits."""
    card = _get_user_card_or_404(db, user.id, card_id)
    card.due_day = payload.due_day
    card.closing_day = payload.closing_day

    db.query(CreditCardSpendingLimit).filter(
        CreditCardSpendingLimit.credit_card_id == card.id
    ).delete(synchronize_session=False)
    # Flush the delete before inserting, so the (card, day) unique key is free.
    db.flush()
    for item in payload.limits:
        db.add(
            CreditCardSpendingLimit(
                credit_card_id=card.id,
                day_of_month=item.day_of_month,
                limit_amount=item.limit_amount,
            )
        )
    db.commit()

    card = _get_user_card_or_404(db, user.id, card_id)
    return _to_settings_response(card, _load_limits(db, card.id))


@router.get("/{card_id}/cycle-dashboard", response_model=CreditCardCycleDashboardRead)
def get_credit_card_cycle_dashboard(
    card_id: int,
    reference_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    card = _get_user_card_or_404(db, user.id, card_id)
    # The cycle ends on the closing day; without it, fall back to the due day.
    boundary_day = card.closing_day or card.due_day
    if boundary_day is None:
        raise HTTPException(
            status_code=400,
            detail="Defina o dia de fechamento do cartão para ver o ciclo",
        )

    reference = reference_date or date.today()
    cycle_start, cycle_end = compute_cycle(boundary_day, reference)
    if card.closing_day and card.due_day:
        due_date = compute_due_date(cycle_end, card.due_day)
    elif card.closing_day:
        due_date = None
    else:
        due_date = cycle_end

    rows = (
        db.query(Expense.launch_date, func.sum(Expense.value))
        .filter(
            Expense.user_id == user.id,
            Expense.credit_card_id == card.id,
            Expense.payment_method == "credit",
            Expense.launch_date >= cycle_start,
            Expense.launch_date <= cycle_end,
        )
        .group_by(Expense.launch_date)
        .all()
    )
    daily_totals = {launch: Decimal(total or 0) for launch, total in rows}

    anchors = build_planned_anchors(
        ((item.day_of_month, item.limit_amount) for item in _load_limits(db, card.id)),
        cycle_start,
        cycle_end,
    )
    timeline = build_timeline(cycle_start, cycle_end, daily_totals, anchors)

    clamped_reference = min(max(reference, cycle_start), cycle_end)
    return CreditCardCycleDashboardRead(
        credit_card_id=card.id,
        due_day=card.due_day,
        closing_day=card.closing_day,
        cycle_start=cycle_start,
        cycle_end=cycle_end,
        due_date=due_date,
        previous_reference_date=cycle_start - timedelta(days=1),
        next_reference_date=cycle_end + timedelta(days=1),
        reference_date=reference,
        total_actual=timeline[-1].actual_cumulative if timeline else Decimal("0"),
        total_planned=planned_value_at(anchors, cycle_start, cycle_end),
        planned_to_date=planned_value_at(anchors, cycle_start, clamped_reference),
        points=[
            CreditCardCycleDayPoint(
                date=point.date,
                daily_spent=point.daily_spent,
                actual_cumulative=point.actual_cumulative,
                planned_cumulative=point.planned_cumulative,
                is_threshold=point.is_threshold,
            )
            for point in timeline
        ],
    )
