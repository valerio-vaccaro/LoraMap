"""add device model to uplink messages

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
Create Date: 2026-07-12 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a4b5c6d7e8f9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('device_model', sa.String(length=50), nullable=True))


def downgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.drop_column('device_model')
