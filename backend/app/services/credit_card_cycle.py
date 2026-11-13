"""Billing-cycle helpers for the credit card "planned vs. actual" dashboard.

Cycle definition: a card with ``due_day = D`` has cycles that end on the due
date and start the day after the previous due date. The "current" cycle is
the one containing the reference date (normally today). When D does not exist
in a month (e.g. 31 in February) the last day of that month is used.

Spending limits are *cumulative* thresholds: "by day X of the month I want to
have spent at most L on this card in the current cycle". The planned curve is
built by linear interpolation from zero at the cycle start through each
threshold, staying flat after the last one.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Mapping

CENT = Decimal("0.01")


def _clamped_date(year: int, month: int, day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last_day))


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def compute_cycle(due_day: int, reference: date) -> tuple[date, date]:
    """Return ``(cycle_start, cycle_end)`` of the cycle containing ``reference``."""
    if not 1 <= due_day <= 31:
        raise ValueError("due_day must be between 1 and 31")

    cycle_end = _clamped_date(reference.year, reference.month, due_day)
    if cycle_end < reference:
        year, month = _shift_month(reference.year, reference.month, 1)
        cycle_end = _clamped_date(year, month, due_day)

    prev_year, prev_month = _shift_month(cycle_end.year, cycle_end.month, -1)
    previous_due = _clamped_date(prev_year, prev_month, due_day)
    return previous_due + timedelta(days=1), cycle_end


def map_day_to_cycle(day_of_month: int, start: date, end: date) -> date | None:
    """Find the date inside ``[start, end]`` that corresponds to ``day_of_month``.

    An exact match wins over a clamped one (e.g. day 30 in February maps to
    the 28th/29th only if no real 30th is inside the cycle).
    """
    months = {(start.year, start.month), (end.year, end.month)}
    exact: list[date] = []
    clamped: list[date] = []
    for year, month in sorted(months):
        candidate = _clamped_date(year, month, day_of_month)
        if not start <= candidate <= end:
            continue
        (exact if candidate.day == day_of_month else clamped).append(candidate)
    if exact:
        return min(exact)
    if clamped:
        return min(clamped)
    return None


def build_planned_anchors(
    limits: Iterable[tuple[int, Decimal]], start: date, end: date
) -> list[tuple[date, Decimal]]:
    """Map ``(day_of_month, limit)`` thresholds onto cycle dates, ordered by date.

    If two thresholds land on the same date (only possible through clamping),
    the larger limit is kept.
    """
    by_date: dict[date, Decimal] = {}
    for day_of_month, amount in limits:
        target = map_day_to_cycle(day_of_month, start, end)
        if target is None:
            continue
        amount = Decimal(amount)
        if target not in by_date or amount > by_date[target]:
            by_date[target] = amount
    return sorted(by_date.items())


def planned_value_at(
    anchors: list[tuple[date, Decimal]], start: date, day: date
) -> Decimal | None:
    if not anchors:
        return None

    prev_date, prev_value = start - timedelta(days=1), Decimal("0")
    for anchor_date, anchor_value in anchors:
        if day <= anchor_date:
            span = (anchor_date - prev_date).days
            elapsed = (day - prev_date).days
            value = prev_value + (anchor_value - prev_value) * elapsed / span
            return value.quantize(CENT, rounding=ROUND_HALF_UP)
        prev_date, prev_value = anchor_date, anchor_value
    return prev_value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class CycleDayPoint:
    date: date
    daily_spent: Decimal
    actual_cumulative: Decimal
    planned_cumulative: Decimal | None
    is_threshold: bool


def build_timeline(
    start: date,
    end: date,
    daily_totals: Mapping[date, Decimal],
    anchors: list[tuple[date, Decimal]],
) -> list[CycleDayPoint]:
    anchor_dates = {anchor_date for anchor_date, _ in anchors}
    points: list[CycleDayPoint] = []
    running = Decimal("0")
    current = start
    while current <= end:
        daily = Decimal(daily_totals.get(current, 0)).quantize(CENT)
        running += daily
        points.append(
            CycleDayPoint(
                date=current,
                daily_spent=daily,
                actual_cumulative=running.quantize(CENT),
                planned_cumulative=planned_value_at(anchors, start, current),
                is_threshold=current in anchor_dates,
            )
        )
        current += timedelta(days=1)
    return points
