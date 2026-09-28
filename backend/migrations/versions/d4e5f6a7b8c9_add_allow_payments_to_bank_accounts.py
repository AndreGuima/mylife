"""add allow payments to bank accounts

Revision ID: d4e5f6a7b8c9
Revises: 7b4c8d2e1f30, c5f1d8a2b9e3
Create Date: 2026-09-23 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = ("7b4c8d2e1f30", "c5f1d8a2b9e3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column(
            "allow_payments",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("bank_accounts", "allow_payments")
