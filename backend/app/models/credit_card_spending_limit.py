from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from database import Base
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CreditCardSpendingLimit(Base):
    """Cumulative spending threshold for a day of the month on a credit card.

    ``limit_amount`` is the maximum the user plans to have spent on the card
    (within the current billing cycle) by ``day_of_month``.
    """

    __tablename__ = "credit_card_spending_limits"
    __table_args__ = (
        UniqueConstraint(
            "credit_card_id",
            "day_of_month",
            name="ux_credit_card_spending_limits_card_day",
        ),
        CheckConstraint(
            "day_of_month BETWEEN 1 AND 31",
            name="ck_credit_card_spending_limits_day_range",
        ),
        CheckConstraint(
            "limit_amount >= 0",
            name="ck_credit_card_spending_limits_amount_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    credit_card_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("credit_cards.id", ondelete="CASCADE"), nullable=False
    )
    day_of_month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    credit_card: Mapped["CreditCard"] = relationship(
        "CreditCard", back_populates="spending_limits"
    )


from models.credit_card import CreditCard  # noqa: E402,F401
