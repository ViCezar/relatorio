"""add user last seen timestamp

Revision ID: 20260307_0003
Revises: 20260303_0002
Create Date: 2026-03-07 10:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260307_0003'
down_revision: str | None = '20260303_0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_seen_at')
