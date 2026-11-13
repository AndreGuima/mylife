from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreditCardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CreditCardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class CreditCardRead(BaseModel):
    id: int
    name: str
    due_day: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CreditCardSpendingLimitItem(BaseModel):
    day_of_month: int = Field(ge=1, le=31)
    limit_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)

    model_config = ConfigDict(from_attributes=True)


class CreditCardSettingsUpdate(BaseModel):
    due_day: int | None = Field(default=None, ge=1, le=31)
    limits: list[CreditCardSpendingLimitItem] = Field(default_factory=list)

    @field_validator("limits")
    @classmethod
    def _unique_days(
        cls, limits: list[CreditCardSpendingLimitItem]
    ) -> list[CreditCardSpendingLimitItem]:
        days = [item.day_of_month for item in limits]
        if len(days) != len(set(days)):
            raise ValueError("Cada dia do mês pode ter apenas um limite")
        return limits


class CreditCardSettingsRead(BaseModel):
    credit_card_id: int
    due_day: int | None = None
    limits: list[CreditCardSpendingLimitItem] = Field(default_factory=list)


class CreditCardCycleDayPoint(BaseModel):
    date: date
    daily_spent: Decimal
    actual_cumulative: Decimal
    planned_cumulative: Decimal | None = None
    is_threshold: bool = False


class CreditCardCycleDashboardRead(BaseModel):
    credit_card_id: int
    due_day: int
    cycle_start: date
    cycle_end: date
    reference_date: date
    total_actual: Decimal
    total_planned: Decimal | None = None
    planned_to_date: Decimal | None = None
    points: list[CreditCardCycleDayPoint]
