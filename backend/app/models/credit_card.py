from __future__ import annotations

from datetime import datetime

from database import Base
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship


class CreditCard(Base):
    __tablename__ = "credit_cards"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="ux_credit_cards_user_name"),
        CheckConstraint(
            "due_day IS NULL OR (due_day BETWEEN 1 AND 31)",
            name="ck_credit_cards_due_day_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Day of the month (1-31) on which the card statement is due.
    due_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    user: Mapped["User"] = relationship("User", back_populates="credit_cards")
    expenses: Mapped[list["Expense"]] = relationship(
        "Expense", back_populates="credit_card"
    )
    spending_limits: Mapped[list["CreditCardSpendingLimit"]] = relationship(
        "CreditCardSpendingLimit",
        back_populates="credit_card",
        cascade="all, delete-orphan",
        order_by="CreditCardSpendingLimit.day_of_month",
    )


from models.credit_card_spending_limit import CreditCardSpendingLimit  # noqa: E402,F401
from models.expense import Expense  # noqa: E402,F401
from models.user import User  # noqa: E402,F401
