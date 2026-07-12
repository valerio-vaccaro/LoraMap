"""add device access tokens

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-07-12 15:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e2f3a4b5c6d7'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'device_access_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('locked', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_device_access_tokens')),
        sa.UniqueConstraint('token_hash', name=op.f('uq_device_access_tokens_token_hash')),
        sa.UniqueConstraint('user_id', 'name', name='uq_device_access_tokens_user_name'),
    )
    op.create_index('ix_device_access_tokens_user_id_locked', 'device_access_tokens', ['user_id', 'locked'], unique=False)
    op.create_index(op.f('ix_device_access_tokens_user_id'), 'device_access_tokens', ['user_id'], unique=False)

    op.create_table(
        'device_access_token_devices',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['token_id'], ['device_access_tokens.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_device_access_token_devices')),
        sa.UniqueConstraint('token_id', 'device_id', name='uq_device_access_token_devices_token_device'),
    )
    op.create_index('ix_device_access_token_devices_token_id_device_id', 'device_access_token_devices', ['token_id', 'device_id'], unique=False)
    op.create_index(op.f('ix_device_access_token_devices_token_id'), 'device_access_token_devices', ['token_id'], unique=False)
    op.create_index(op.f('ix_device_access_token_devices_device_id'), 'device_access_token_devices', ['device_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_device_access_token_devices_device_id'), table_name='device_access_token_devices')
    op.drop_index(op.f('ix_device_access_token_devices_token_id'), table_name='device_access_token_devices')
    op.drop_index('ix_device_access_token_devices_token_id_device_id', table_name='device_access_token_devices')
    op.drop_table('device_access_token_devices')
    op.drop_index(op.f('ix_device_access_tokens_user_id'), table_name='device_access_tokens')
    op.drop_index('ix_device_access_tokens_user_id_locked', table_name='device_access_tokens')
    op.drop_table('device_access_tokens')
