"""add real timestamp to uplink messages

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('real_timestamp', sa.DateTime(), nullable=True))

    op.execute('UPDATE uplink_messages SET real_timestamp = received_at WHERE real_timestamp IS NULL')

    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.alter_column('real_timestamp', existing_type=sa.DateTime(), nullable=False)
        batch_op.create_index(batch_op.f('ix_uplink_messages_real_timestamp'), ['real_timestamp'], unique=False)


def downgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_uplink_messages_real_timestamp'))
        batch_op.drop_column('real_timestamp')
