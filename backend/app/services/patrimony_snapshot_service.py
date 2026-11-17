from datetime import datetime, timedelta
from decimal import Decimal

from core.formatting import format_brl
from models.bank_account import BankAccount
from models.patrimony_snapshot import PatrimonySnapshot
from models.patrimony_snapshot_account import PatrimonySnapshotAccount
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

ZERO = Decimal("0.00")


def _build_breakdown_signature(accounts):
    return [
        (
            account.id,
            account.total_value or ZERO,
        )
        for account in sorted(accounts, key=lambda acc: acc.id)
    ]


def capture_patrimony_snapshot(db: Session, user_id: int) -> None:
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.user_id == user_id)
        .order_by(BankAccount.id.asc())
        .all()
    )

    total = sum(
        ((account.total_value or ZERO) for account in accounts),
        start=ZERO,
    )
    current_signature = _build_breakdown_signature(accounts)
    last_snapshot = (
        db.query(PatrimonySnapshot)
        .options(selectinload(PatrimonySnapshot.accounts))
        .filter(PatrimonySnapshot.user_id == user_id)
        .order_by(PatrimonySnapshot.id.desc())
        .first()
    )
    if last_snapshot:
        last_signature = [
            (
                account.bank_account_id,
                account.total_value or ZERO,
            )
            for account in sorted(
                last_snapshot.accounts,
                key=lambda item: item.bank_account_id or 0,
            )
        ]
        if last_snapshot.total_value == total and last_signature == current_signature:
            return

    snapshot = PatrimonySnapshot(
        user_id=user_id,
        total_value=total,
        has_breakdown=True,
    )
    db.add(snapshot)
    db.flush()

    snapshot.accounts.extend(
        [
            PatrimonySnapshotAccount(
                bank_account_id=account.id,
                account_name=account.name,
                total_value=account.total_value or ZERO,
            )
            for account in accounts
        ]
    )


def _previous_month_range(now: datetime) -> tuple[datetime, datetime]:
    current_month_start = datetime(now.year, now.month, 1)
    if now.month == 1:
        previous_month_start = datetime(now.year - 1, 12, 1)
    else:
        previous_month_start = datetime(now.year, now.month - 1, 1)
    return previous_month_start, current_month_start


def _previous_semester_range(now: datetime) -> tuple[datetime, datetime]:
    if now.month <= 6:
        return datetime(now.year - 1, 7, 1), datetime(now.year, 1, 1)
    return datetime(now.year, 1, 1), datetime(now.year, 7, 1)


def _same_day_previous_year_end(now: datetime) -> datetime:
    try:
        previous_year_day = now.replace(year=now.year - 1)
    except ValueError:
        previous_year_day = now.replace(year=now.year - 1, day=28)

    return datetime.combine(
        previous_year_day.date() + timedelta(days=1),
        datetime.min.time(),
    )


def _get_latest_snapshot_total(
    db: Session,
    user_id: int,
    *,
    start: datetime | None = None,
    end: datetime,
) -> Decimal | None:
    query = db.query(PatrimonySnapshot).filter(
        PatrimonySnapshot.user_id == user_id,
        PatrimonySnapshot.snapshot_at < end,
    )
    if start is not None:
        query = query.filter(PatrimonySnapshot.snapshot_at >= start)

    snapshot = query.order_by(
        PatrimonySnapshot.snapshot_at.desc(),
        PatrimonySnapshot.id.desc(),
    ).first()
    if not snapshot:
        return None
    return Decimal(snapshot.total_value or ZERO)


def get_current_patrimony_total(db: Session, user_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(BankAccount.total_value), ZERO))
        .filter(BankAccount.user_id == user_id)
        .scalar()
    )
    return Decimal(total or ZERO)


def get_previous_month_patrimony_total(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> Decimal | None:
    previous_month_start, current_month_start = _previous_month_range(
        now or datetime.now(),
    )
    return _get_latest_snapshot_total(
        db,
        user_id,
        start=previous_month_start,
        end=current_month_start,
    )


def get_previous_semester_patrimony_total(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> Decimal | None:
    previous_semester_start, current_semester_start = _previous_semester_range(
        now or datetime.now(),
    )
    return _get_latest_snapshot_total(
        db,
        user_id,
        start=previous_semester_start,
        end=current_semester_start,
    )


def get_same_day_previous_year_patrimony_total(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> Decimal | None:
    return _get_latest_snapshot_total(
        db,
        user_id,
        end=_same_day_previous_year_end(now or datetime.now()),
    )


def _build_comparison_label(
    current_total: Decimal,
    previous_total: Decimal | None,
    comparison_period: str,
    missing_period: str,
) -> str:
    if previous_total is None:
        return f"Ainda não há montante {missing_period} para comparar."

    delta = current_total - previous_total
    if delta > ZERO:
        return f"Você tem {format_brl(delta)} a mais {comparison_period}."
    if delta < ZERO:
        return f"Você tem {format_brl(abs(delta))} a menos {comparison_period}."
    return f"Você está com o mesmo montante {comparison_period}."


def build_patrimony_email_context(
    db: Session,
    user_id: int,
    now: datetime | None = None,
) -> dict[str, str]:
    current_total = get_current_patrimony_total(db, user_id)
    previous_total = get_previous_month_patrimony_total(db, user_id, now)
    previous_semester_total = get_previous_semester_patrimony_total(db, user_id, now)
    previous_year_total = get_same_day_previous_year_patrimony_total(
        db,
        user_id,
        now,
    )

    return {
        "patrimony_total_label": format_brl(current_total),
        "patrimony_comparison_label": _build_comparison_label(
            current_total,
            previous_total,
            "que o mês passado",
            "do mês passado",
        ),
        "patrimony_semester_comparison_label": _build_comparison_label(
            current_total,
            previous_semester_total,
            "em relação ao semestre passado",
            "do semestre passado",
        ),
        "patrimony_year_comparison_label": _build_comparison_label(
            current_total,
            previous_year_total,
            "em relação ao mesmo dia do ano passado",
            "do mesmo dia do ano passado",
        ),
    }
