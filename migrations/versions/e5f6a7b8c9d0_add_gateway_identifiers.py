"""add gateway identifiers

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-12 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gateway_id', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('gateway_eui', sa.String(length=32), nullable=True))


def downgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.drop_column('gateway_eui')
        batch_op.drop_column('gateway_id')
