"""add query performance indexes

Revision ID: c8d9e0f1a2b3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-12 14:20:00.000000

"""
from alembic import op


revision = 'c8d9e0f1a2b3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index(
        'ix_datasources_user_id_enabled',
        'datasources',
        ['user_id', 'enabled'],
        unique=False,
    )
    op.create_index(
        'ix_uplink_messages_datasource_real_timestamp',
        'uplink_messages',
        ['datasource_id', 'real_timestamp'],
        unique=False,
    )
    op.create_index(
        'ix_uplink_messages_datasource_device_real_timestamp',
        'uplink_messages',
        ['datasource_id', 'device_id', 'real_timestamp'],
        unique=False,
    )


def downgrade():
    op.drop_index('ix_uplink_messages_datasource_device_real_timestamp', table_name='uplink_messages')
    op.drop_index('ix_uplink_messages_datasource_real_timestamp', table_name='uplink_messages')
    op.drop_index('ix_datasources_user_id_enabled', table_name='datasources')
