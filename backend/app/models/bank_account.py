from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from database import Base
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    objective_dream_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("dreams.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    total_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allow_investment_income: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    allow_payments: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    user: Mapped["User"] = relationship("User", back_populates="bank_accounts")
    objective_dream: Mapped["Dream"] = relationship(
        "Dream",
        back_populates="bank_accounts",
    )
    transactions: Mapped[list["BankAccountTransaction"]] = relationship(
        "BankAccountTransaction",
        back_populates="account",
        cascade="all, delete-orphan",
    )
    outgoing_transfers: Mapped[list["BankAccountTransfer"]] = relationship(
        "BankAccountTransfer",
        back_populates="from_account",
        foreign_keys="BankAccountTransfer.from_account_id",
    )
    incoming_transfers: Mapped[list["BankAccountTransfer"]] = relationship(
        "BankAccountTransfer",
        back_populates="to_account",
        foreign_keys="BankAccountTransfer.to_account_id",
    )


from models.bank_account_transaction import BankAccountTransaction  # noqa: E402,F401
from models.bank_account_transfer import BankAccountTransfer  # noqa: E402,F401
from models.dream import Dream  # noqa: E402,F401
from models.user import User  # noqa: E402,F401
