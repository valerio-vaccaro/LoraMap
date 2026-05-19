"""add device color preferences

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'device_color_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(length=100), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_device_color_preferences')),
        sa.UniqueConstraint('user_id', 'device_id', name='uq_device_color_preferences_user_device'),
    )
    with op.batch_alter_table('device_color_preferences', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_device_color_preferences_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_device_color_preferences_device_id'), ['device_id'], unique=False)


def downgrade():
    with op.batch_alter_table('device_color_preferences', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_device_color_preferences_device_id'))
        batch_op.drop_index(batch_op.f('ix_device_color_preferences_user_id'))

    op.drop_table('device_color_preferences')
