"""add llm_analysis to dq_run

Revision ID: a1b2c3d4e5f6
Revises: f45168fffd03
Create Date: 2026-07-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f45168fffd03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("dq_run", sa.Column("llm_analysis", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("dq_run", "llm_analysis")