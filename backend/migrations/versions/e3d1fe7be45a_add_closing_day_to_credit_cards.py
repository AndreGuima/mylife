"""add closing day to credit cards

Revision ID: e3d1fe7be45a
Revises: 5237f3d22c0a
Create Date: 2026-11-16 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3d1fe7be45a"
down_revision: Union[str, None] = "5237f3d22c0a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable: existing cards keep working (cycle falls back to the due day)
    # until the user configures the closing day.
    op.add_column(
        "credit_cards",
        sa.Column("closing_day", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "ck_credit_cards_closing_day_range",
        "credit_cards",
        "closing_day IS NULL OR (closing_day BETWEEN 1 AND 31)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_credit_cards_closing_day_range", "credit_cards", type_="check"
    )
    op.drop_column("credit_cards", "closing_day")
