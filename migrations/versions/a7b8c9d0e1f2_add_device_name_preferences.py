"""add device name preferences

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-13

"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'device_name_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(length=100), nullable=False),
        sa.Column('short_name', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name=op.f('fk_device_name_preferences_user_id_users'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_device_name_preferences')),
        sa.UniqueConstraint(
            'user_id',
            'device_id',
            name='uq_device_name_preferences_user_device',
        ),
    )
    with op.batch_alter_table('device_name_preferences', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_device_name_preferences_user_id'),
            ['user_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_device_name_preferences_device_id'),
            ['device_id'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('device_name_preferences', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_device_name_preferences_device_id'))
        batch_op.drop_index(batch_op.f('ix_device_name_preferences_user_id'))
    op.drop_table('device_name_preferences')
