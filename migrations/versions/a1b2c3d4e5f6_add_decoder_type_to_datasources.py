"""add decoder_type to datasources

Revision ID: a1b2c3d4e5f6
Revises: e711d40b11a3
Create Date: 2026-04-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = '92710b6d7315'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('datasources', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'decoder_type',
            sa.String(length=50),
            nullable=False,
            server_default='sensecap_t1000a',
        ))


def downgrade():
    with op.batch_alter_table('datasources', schema=None) as batch_op:
        batch_op.drop_column('decoder_type')
