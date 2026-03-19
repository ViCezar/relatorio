"""initial schema

Revision ID: 20260302_0001
Revises:
Create Date: 2026-03-02 16:50:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '20260302_0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


user_role = postgresql.ENUM('ADMIN', 'USER', name='user_role', create_type=False)


def upgrade() -> None:
    user_role.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'branches',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_index(op.f('ix_branches_id'), 'branches', ['id'], unique=False)

    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', user_role, nullable=False, server_default='USER'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    op.create_table(
        'sectors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('color', sa.String(length=30), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'name', name='uq_sector_branch_name'),
    )
    op.create_index(op.f('ix_sectors_branch_id'), 'sectors', ['branch_id'], unique=False)
    op.create_index(op.f('ix_sectors_id'), 'sectors', ['id'], unique=False)

    op.create_table(
        'agents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('sector_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sector_id'], ['sectors.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'name', name='uq_agent_branch_name'),
    )
    op.create_index(op.f('ix_agents_branch_id'), 'agents', ['branch_id'], unique=False)
    op.create_index(op.f('ix_agents_id'), 'agents', ['id'], unique=False)
    op.create_index(op.f('ix_agents_sector_id'), 'agents', ['sector_id'], unique=False)

    op.create_table(
        'monthly_reports',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'month', 'year', name='uq_report_branch_month_year'),
    )
    op.create_index(op.f('ix_monthly_reports_branch_id'), 'monthly_reports', ['branch_id'], unique=False)
    op.create_index(op.f('ix_monthly_reports_id'), 'monthly_reports', ['id'], unique=False)
    op.create_index(op.f('ix_monthly_reports_month'), 'monthly_reports', ['month'], unique=False)
    op.create_index(op.f('ix_monthly_reports_year'), 'monthly_reports', ['year'], unique=False)

    op.create_table(
        'monthly_report_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), nullable=False),
        sa.Column('agent_id', sa.Integer(), nullable=False),
        sa.Column('tickets_finalizados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('raw_name_from_excel', sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['report_id'], ['monthly_reports.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('report_id', 'agent_id', name='uq_report_item_agent'),
    )
    op.create_index(op.f('ix_monthly_report_items_agent_id'), 'monthly_report_items', ['agent_id'], unique=False)
    op.create_index(op.f('ix_monthly_report_items_id'), 'monthly_report_items', ['id'], unique=False)
    op.create_index(op.f('ix_monthly_report_items_report_id'), 'monthly_report_items', ['report_id'], unique=False)

    op.create_table(
        'pending_import_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_id', sa.Integer(), nullable=False),
        sa.Column('raw_name_from_excel', sa.String(length=255), nullable=False),
        sa.Column('tickets_finalizados', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('resolved_agent_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['report_id'], ['monthly_reports.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['resolved_agent_id'], ['agents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_pending_import_items_id'), 'pending_import_items', ['id'], unique=False)
    op.create_index(op.f('ix_pending_import_items_report_id'), 'pending_import_items', ['report_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_pending_import_items_report_id'), table_name='pending_import_items')
    op.drop_index(op.f('ix_pending_import_items_id'), table_name='pending_import_items')
    op.drop_table('pending_import_items')

    op.drop_index(op.f('ix_monthly_report_items_report_id'), table_name='monthly_report_items')
    op.drop_index(op.f('ix_monthly_report_items_id'), table_name='monthly_report_items')
    op.drop_index(op.f('ix_monthly_report_items_agent_id'), table_name='monthly_report_items')
    op.drop_table('monthly_report_items')

    op.drop_index(op.f('ix_monthly_reports_year'), table_name='monthly_reports')
    op.drop_index(op.f('ix_monthly_reports_month'), table_name='monthly_reports')
    op.drop_index(op.f('ix_monthly_reports_id'), table_name='monthly_reports')
    op.drop_index(op.f('ix_monthly_reports_branch_id'), table_name='monthly_reports')
    op.drop_table('monthly_reports')

    op.drop_index(op.f('ix_agents_sector_id'), table_name='agents')
    op.drop_index(op.f('ix_agents_id'), table_name='agents')
    op.drop_index(op.f('ix_agents_branch_id'), table_name='agents')
    op.drop_table('agents')

    op.drop_index(op.f('ix_sectors_id'), table_name='sectors')
    op.drop_index(op.f('ix_sectors_branch_id'), table_name='sectors')
    op.drop_table('sectors')

    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')

    op.drop_index(op.f('ix_branches_id'), table_name='branches')
    op.drop_table('branches')

    user_role.drop(op.get_bind(), checkfirst=True)
