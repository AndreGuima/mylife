"""Consultas do ciclo de fatura e resumo "planejado x realizado" por cartão.

Usado pela rota ``/credit-cards/{id}/cycle-dashboard`` e pelo e-mail diário,
para que os dois mostrem exatamente a mesma "Situação até hoje".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from core.formatting import format_brl
from models.credit_card import CreditCard
from models.credit_card_spending_limit import CreditCardSpendingLimit
from models.expense import Expense
from services.credit_card_cycle import (
    build_planned_anchors,
    compute_cycle,
    compute_due_date,
    planned_value_at,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

ZERO = Decimal("0")


def load_limits(db: Session, card_id: int) -> list[CreditCardSpendingLimit]:
    return (
        db.query(CreditCardSpendingLimit)
        .filter(CreditCardSpendingLimit.credit_card_id == card_id)
        .order_by(CreditCardSpendingLimit.day_of_month.asc())
        .all()
    )


def load_daily_totals(
    db: Session, user_id: int, card_id: int, start: date, end: date
) -> dict[date, Decimal]:
    """Soma dos gastos no crédito do cartão por dia, dentro de ``[start, end]``."""
    rows = (
        db.query(Expense.launch_date, func.sum(Expense.value))
        .filter(
            Expense.user_id == user_id,
            Expense.credit_card_id == card_id,
            Expense.payment_method == "credit",
            Expense.launch_date >= start,
            Expense.launch_date <= end,
        )
        .group_by(Expense.launch_date)
        .all()
    )
    return {launch: Decimal(total or 0) for launch, total in rows}


def cycle_due_date(card: CreditCard, cycle_end: date) -> date | None:
    if card.closing_day and card.due_day:
        return compute_due_date(cycle_end, card.due_day)
    if card.closing_day:
        return None
    return cycle_end


@dataclass
class CardCycleSummary:
    card_name: str
    cycle_start: date
    cycle_end: date
    due_date: date | None
    actual_to_date: Decimal
    planned_to_date: Decimal
    planned_total: Decimal

    @property
    def delta(self) -> Decimal:
        """Positivo = abaixo do planejado; negativo = acima."""
        return self.planned_to_date - self.actual_to_date


def build_card_cycle_summary(
    db: Session, card: CreditCard, today: date
) -> CardCycleSummary | None:
    """Resumo do ciclo atual até ``today``.

    Retorna ``None`` se o cartão não tem dia de fechamento/vencimento ou não
    tem limites planejados (sem planejado não há "situação" a mostrar).
    """
    boundary_day = card.closing_day or card.due_day
    if boundary_day is None:
        return None

    cycle_start, cycle_end = compute_cycle(boundary_day, today)
    anchors = build_planned_anchors(
        ((item.day_of_month, item.limit_amount) for item in load_limits(db, card.id)),
        cycle_start,
        cycle_end,
    )
    if not anchors:
        return None

    # Mesma regra da tela: no ciclo atual, compara só os gastos até hoje.
    daily_totals = load_daily_totals(db, card.user_id, card.id, cycle_start, today)
    actual_to_date = sum(daily_totals.values(), start=ZERO).quantize(Decimal("0.01"))

    return CardCycleSummary(
        card_name=card.name,
        cycle_start=cycle_start,
        cycle_end=cycle_end,
        due_date=cycle_due_date(card, cycle_end),
        actual_to_date=actual_to_date,
        planned_to_date=planned_value_at(anchors, cycle_start, today),
        planned_total=planned_value_at(anchors, cycle_start, cycle_end),
    )


def _format_day_month(value: date) -> str:
    return value.strftime("%d/%m")


def build_credit_card_email_context(
    db: Session, user_id: int, today: date
) -> dict[str, list[dict]]:
    """Contexto do e-mail diário: um item por cartão com planejamento configurado."""
    cards = (
        db.query(CreditCard)
        .filter(CreditCard.user_id == user_id)
        .order_by(CreditCard.name.asc())
        .all()
    )

    items: list[dict] = []
    for card in cards:
        summary = build_card_cycle_summary(db, card, today)
        if summary is None:
            continue

        delta = summary.delta
        if delta > ZERO:
            status, label = "below", f"{format_brl(delta)} abaixo"
        elif delta < ZERO:
            status, label = "above", f"{format_brl(-delta)} acima"
        else:
            status, label = "on_track", "Exatamente no planejado"

        items.append(
            {
                "name": summary.card_name,
                "status": status,
                "situation_label": label,
                "actual_label": format_brl(summary.actual_to_date),
                "planned_label": format_brl(summary.planned_to_date),
                "planned_total_label": format_brl(summary.planned_total),
                "period_label": (
                    f"{_format_day_month(summary.cycle_start)} a "
                    f"{_format_day_month(summary.cycle_end)}"
                ),
                "due_date_label": (
                    _format_day_month(summary.due_date) if summary.due_date else None
                ),
            }
        )

    return {"credit_card_cycles": items}
