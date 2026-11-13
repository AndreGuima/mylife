"""add credit card due day and spending limits

Revision ID: 5237f3d22c0a
Revises: d4e5f6a7b8c9
Create Date: 2026-11-13 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5237f3d22c0a"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: existing cards have no due day until the user configures one.
    op.add_column(
        "credit_cards",
        sa.Column("due_day", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "ck_credit_cards_due_day_range",
        "credit_cards",
        "due_day IS NULL OR (due_day BETWEEN 1 AND 31)",
    )

    op.create_table(
        "credit_card_spending_limits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("credit_card_id", sa.Integer(), nullable=False),
        sa.Column("day_of_month", sa.SmallInteger(), nullable=False),
        sa.Column("limit_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["credit_card_id"], ["credit_cards.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        # The unique index (credit_card_id first) also serves the FK lookup.
        sa.UniqueConstraint(
            "credit_card_id",
            "day_of_month",
            name="ux_credit_card_spending_limits_card_day",
        ),
        sa.CheckConstraint(
            "day_of_month BETWEEN 1 AND 31",
            name="ck_credit_card_spending_limits_day_range",
        ),
        sa.CheckConstraint(
            "limit_amount >= 0",
            name="ck_credit_card_spending_limits_amount_non_negative",
        ),
    )


def downgrade() -> None:
    op.drop_table("credit_card_spending_limits")
    op.drop_constraint("ck_credit_cards_due_day_range", "credit_cards", type_="check")
    op.drop_column("credit_cards", "due_day")
