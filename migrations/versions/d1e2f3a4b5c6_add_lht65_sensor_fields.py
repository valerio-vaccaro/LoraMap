"""add lht65 sensor fields

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-07-12 14:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
import json


revision = 'd1e2f3a4b5c6'
down_revision = 'c8d9e0f1a2b3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('battery_voltage', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('external_temperature', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('humidity', sa.Float(), nullable=True))

    bind = op.get_bind()
    messages = sa.table(
        'uplink_messages',
        sa.column('id', sa.Integer),
        sa.column('air_temperature', sa.Float),
        sa.column('battery_voltage', sa.Float),
        sa.column('external_temperature', sa.Float),
        sa.column('humidity', sa.Float),
        sa.column('event_status', sa.String),
    )

    rows = bind.execute(sa.select(
        messages.c.id,
        messages.c.air_temperature,
        messages.c.event_status,
    )).fetchall()

    for row in rows:
        try:
            payload = json.loads(row.event_status) if row.event_status else None
        except (TypeError, ValueError, json.JSONDecodeError):
            payload = None
        if not isinstance(payload, dict):
            continue

        values = {}
        if payload.get('battery_voltage') is not None:
            values['battery_voltage'] = payload.get('battery_voltage')
        if payload.get('humidity_sht') is not None:
            values['humidity'] = payload.get('humidity_sht')
        if payload.get('tempc_ds') is not None:
            values['external_temperature'] = payload.get('tempc_ds')
        if payload.get('tempc_sht') is not None:
            values['air_temperature'] = payload.get('tempc_sht')
        if not values:
            continue

        bind.execute(
            messages.update().where(messages.c.id == row.id).values(**values)
        )


def downgrade():
    with op.batch_alter_table('uplink_messages', schema=None) as batch_op:
        batch_op.drop_column('humidity')
        batch_op.drop_column('external_temperature')
        batch_op.drop_column('battery_voltage')
