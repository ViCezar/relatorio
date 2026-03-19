"""add baldussi manual columns

Revision ID: 20260303_0002
Revises: 20260302_0001
Create Date: 2026-03-03 11:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260303_0002'
down_revision: str | None = '20260302_0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'monthly_report_items',
        sa.Column('baldussi_destino', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'monthly_report_items',
        sa.Column('baldussi_origem', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column(
        'monthly_report_items',
        sa.Column('blip', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_column('monthly_report_items', 'blip')
    op.drop_column('monthly_report_items', 'baldussi_origem')
    op.drop_column('monthly_report_items', 'baldussi_destino')
