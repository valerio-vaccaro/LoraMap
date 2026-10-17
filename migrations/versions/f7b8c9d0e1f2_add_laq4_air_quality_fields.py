"""add LAQ4 air quality fields

Revision ID: f7b8c9d0e1f2
Revises: d4e5f6a7b8c9
"""
from alembic import op
import sqlalchemy as sa

revision = 'f7b8c9d0e1f2'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages') as batch_op:
        batch_op.add_column(sa.Column('co2_ppm', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('tvoc_ppb', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('work_mode', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('alarm_status', sa.String(length=20), nullable=True))


def downgrade():
    with op.batch_alter_table('uplink_messages') as batch_op:
        batch_op.drop_column('alarm_status')
        batch_op.drop_column('work_mode')
        batch_op.drop_column('tvoc_ppb')
        batch_op.drop_column('co2_ppm')
