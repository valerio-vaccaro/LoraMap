"""scope uplink uniqueness to its datasource

Revision ID: a8c9d0e1f2b3
Revises: f7b8c9d0e1f2
"""
from alembic import op

revision = 'a8c9d0e1f2b3'
down_revision = 'f7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages') as batch_op:
        batch_op.drop_constraint('uq_device_received', type_='unique')
        batch_op.create_unique_constraint(
            'uq_datasource_device_received',
            ['datasource_id', 'device_id', 'received_at'],
        )


def downgrade():
    with op.batch_alter_table('uplink_messages') as batch_op:
        batch_op.drop_constraint('uq_datasource_device_received', type_='unique')
        batch_op.create_unique_constraint(
            'uq_device_received',
            ['device_id', 'received_at'],
        )
