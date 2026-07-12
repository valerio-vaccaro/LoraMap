"""add usage tracking to device access tokens

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-12 16:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a4b5c6d7e8'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('device_access_tokens', schema=None) as batch_op:
        batch_op.add_column(sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('first_used_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_used_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('device_access_tokens', schema=None) as batch_op:
        batch_op.drop_column('last_used_at')
        batch_op.drop_column('first_used_at')
        batch_op.drop_column('usage_count')
