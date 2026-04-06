from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from sqlalchemy import MetaData
from werkzeug.security import generate_password_hash, check_password_hash

_naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

db = SQLAlchemy(metadata=MetaData(naming_convention=_naming_convention))


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    activated = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Profile fields (all optional)
    name = db.Column(db.String(100))
    surname = db.Column(db.String(100))
    address = db.Column(db.String(255))
    state = db.Column(db.String(100))
    phone = db.Column(db.String(30))

    datasources = db.relationship('DataSource', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class DataSource(db.Model):
    __tablename__ = 'datasources'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    api_url = db.Column(db.String(500), nullable=False)
    bearer_token = db.Column(db.String(500), nullable=False)
    time_window = db.Column(db.String(20), default='12h')
    enabled = db.Column(db.Boolean, default=True, nullable=False, server_default='1')
    decoder_type = db.Column(db.String(50), nullable=False, default='sensecap_t1000a', server_default='sensecap_t1000a')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_fetched_at = db.Column(db.DateTime)
    last_fetch_status = db.Column(db.String(255))


class UplinkMessage(db.Model):
    __tablename__ = 'uplink_messages'

    id = db.Column(db.Integer, primary_key=True)
    datasource_id = db.Column(db.Integer, db.ForeignKey('datasources.id', ondelete='CASCADE'), nullable=True, index=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    received_at = db.Column(db.DateTime, nullable=False, index=True)
    f_cnt = db.Column(db.Integer)
    longitude = db.Column(db.Float)
    latitude = db.Column(db.Float)
    battery = db.Column(db.Float)
    rssi = db.Column(db.Integer)
    channel_rssi = db.Column(db.Integer)
    snr = db.Column(db.Float)
    channel_index = db.Column(db.Integer)
    gateway_count = db.Column(db.Integer)
    spreading_factor = db.Column(db.Integer)
    bandwidth = db.Column(db.Integer)
    coding_rate = db.Column(db.String(10))
    consumed_airtime = db.Column(db.String(20))
    positioning_status = db.Column(db.String(50))

    __table_args__ = (
        db.UniqueConstraint('device_id', 'received_at', name='uq_device_received'),
    )
