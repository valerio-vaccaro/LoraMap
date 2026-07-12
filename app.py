import subprocess
from pathlib import Path
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session, send_file
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from sqlalchemy import func
import requests as http_requests

from config import Config
from models import (
    db,
    User,
    DataSource,
    UplinkMessage,
    DeviceColorPreference,
    DeviceNamePreference,
)
from utils import parse_and_store, parse_lines, parse_datetime
from decoders.registry import DECODER_CHOICES


def _get_version() -> str:
    """Return the latest git tag, or 'dev' if none exist."""
    try:
        tag = subprocess.check_output(
            ['git', 'describe', '--tags', '--abbrev=0'],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return tag or 'dev'
    except Exception:
        return 'dev'


APP_VERSION = _get_version()
DEVICE_COLORS = {
    '#E53935', '#1E88E5', '#43A047', '#F4511E', '#8E24AA', '#00ACC1', '#FB8C00', '#D81B60',
    '#6D4C41', '#546E7A', '#7CB342', '#3949AB', '#00897B', '#C0CA33', '#5E35B1', '#FDD835',
    '#8D6E63', '#5C6BC0', '#26A69A', '#9CCC65', '#FF7043', '#EC407A', '#AB47BC', '#29B6F6',
    '#66BB6A', '#FFCA28', '#FFA726', '#BDBDBD', '#78909C', '#26C6DA', '#D4E157', '#EF5350',
    '#C62828', '#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#EF6C00', '#AD1457',
    '#4E342E', '#37474F', '#558B2F', '#283593', '#00695C', '#9E9D24', '#4527A0', '#F9A825',
    '#A1887F', '#7986CB', '#4DB6AC', '#AED581', '#FF8A65', '#F48FB1', '#CE93D8', '#81D4FA',
    '#A5D6A7', '#FFE082', '#FFCC80', '#E0E0E0', '#90A4AE', '#80DEEA', '#E6EE9C', '#EF9A9A',
}


def _airtime_milliseconds(value):
    if not value:
        return None
    text = str(value).strip().lower()
    units = (
        ('ms', 1.0),
        ('us', 0.001),
        ('µs', 0.001),
        ('ns', 0.000001),
        ('s', 1000.0),
    )
    for suffix, multiplier in units:
        if text.endswith(suffix):
            try:
                return float(text[:-len(suffix)]) * multiplier
            except ValueError:
                return None
    return None


app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
app.jinja_env.globals['app_version'] = APP_VERSION
OPENAPI_PATH = Path(__file__).resolve().parent / 'docs' / 'openapi.yaml'


@app.context_processor
def inject_globals():
    return {'now': datetime.utcnow()}
migrate = Migrate(app, db)

login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('map_view'))
    return redirect(url_for('login'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('map_view'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            flash('Invalid username or password.', 'error')
            return render_template('login.html')
        if not user.activated:
            flash('Your account is pending activation. Contact an administrator.', 'warning')
            return render_template('login.html')
        login_user(user, remember=True)
        return redirect(url_for('map_view'))
    return render_template('login.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('map_view'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        if not username or not email or not password:
            flash('All fields are required.', 'error')
            return render_template('register.html')
        if User.query.filter_by(username=username).first():
            flash('Username already taken.', 'error')
            return render_template('register.html')
        if User.query.filter_by(email=email).first():
            flash('Email already registered.', 'error')
            return render_template('register.html')
        user = User(username=username, email=email, activated=0)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        flash('Registration successful. Wait for an administrator to activate your account.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')


@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.route('/map')
@login_required
def map_view():
    return render_template('map.html', google_maps_key=app.config.get('GOOGLE_MAPS_API_KEY', ''))


@app.route('/tracker')
@login_required
def tracker():
    return render_template('tracker.html', google_maps_key=app.config.get('GOOGLE_MAPS_API_KEY', ''))


@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')


@app.route('/data')
@login_required
def data_view():
    return render_template('data.html')


@app.route('/api-docs')
@login_required
def api_docs():
    return render_template('api_docs.html')


@app.route('/openapi.yaml')
@login_required
def openapi_spec():
    return send_file(OPENAPI_PATH, mimetype='application/yaml')


@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        if not email:
            flash('Email is required.', 'error')
            return redirect(url_for('profile'))
        existing = User.query.filter(User.email == email, User.id != current_user.id).first()
        if existing:
            flash('Email already in use by another account.', 'error')
            return redirect(url_for('profile'))
        current_user.email   = email
        current_user.name    = request.form.get('name', '').strip() or None
        current_user.surname = request.form.get('surname', '').strip() or None
        current_user.address = request.form.get('address', '').strip() or None
        current_user.state   = request.form.get('state', '').strip() or None
        current_user.phone   = request.form.get('phone', '').strip() or None
        db.session.commit()
        flash('Profile updated.', 'success')
        return redirect(url_for('profile'))
    sources = DataSource.query.filter_by(user_id=current_user.id).order_by(DataSource.name).all()
    ds_ids = [s.id for s in sources]
    total_messages = UplinkMessage.query.filter(UplinkMessage.datasource_id.in_(ds_ids)).count()
    total_devices = db.session.query(
        func.count(UplinkMessage.device_id.distinct())
    ).filter(UplinkMessage.datasource_id.in_(ds_ids)).scalar()
    return render_template('profile.html', sources=sources,
                           total_messages=total_messages, total_devices=total_devices)


@app.route('/datasources', methods=['GET', 'POST'])
@login_required
def datasources():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        api_url = request.form.get('api_url', '').strip()
        bearer_token = request.form.get('bearer_token', '').strip()
        time_window = request.form.get('time_window', '12h').strip() or '12h'
        decoder_type = request.form.get('decoder_type', 'sensecap_t1000a').strip()
        if not name or not api_url or not bearer_token:
            flash('Name, API URL and Bearer token are required.', 'error')
        else:
            ds = DataSource(
                user_id=current_user.id,
                name=name,
                api_url=api_url,
                bearer_token=bearer_token,
                time_window=time_window,
                decoder_type=decoder_type,
            )
            db.session.add(ds)
            db.session.commit()
            flash('Data source added.', 'success')
        return redirect(url_for('datasources'))
    sources = DataSource.query.filter_by(user_id=current_user.id).all()
    return render_template('datasources.html', sources=sources, decoder_choices=DECODER_CHOICES)


@app.route('/datasources/<int:ds_id>/edit', methods=['POST'])
@login_required
def edit_datasource(ds_id):
    ds = DataSource.query.filter_by(id=ds_id, user_id=current_user.id).first_or_404()
    name         = request.form.get('name', '').strip()
    api_url      = request.form.get('api_url', '').strip()
    bearer_token = request.form.get('bearer_token', '').strip()
    time_window  = request.form.get('time_window', '12h').strip() or '12h'
    decoder_type = request.form.get('decoder_type', ds.decoder_type).strip()
    if not name or not api_url:
        flash('Name and API URL are required.', 'error')
        return redirect(url_for('datasources'))
    ds.name         = name
    ds.api_url      = api_url
    ds.decoder_type = decoder_type
    if bearer_token:          # keep existing token when field left blank
        ds.bearer_token = bearer_token
    ds.time_window = time_window
    db.session.commit()
    flash(f'"{ds.name}" updated.', 'success')
    return redirect(url_for('datasources'))


@app.route('/datasources/<int:ds_id>/toggle', methods=['POST'])
@login_required
def toggle_datasource(ds_id):
    ds = DataSource.query.filter_by(id=ds_id, user_id=current_user.id).first_or_404()
    ds.enabled = not ds.enabled
    db.session.commit()
    state = 'enabled' if ds.enabled else 'disabled'
    flash(f'"{ds.name}" {state}.', 'success')
    return redirect(url_for('datasources'))


@app.route('/datasources/<int:ds_id>/delete', methods=['POST'])
@login_required
def delete_datasource(ds_id):
    ds = DataSource.query.filter_by(id=ds_id, user_id=current_user.id).first_or_404()
    db.session.delete(ds)
    db.session.commit()
    flash('Data source deleted.', 'success')
    return redirect(url_for('datasources'))


@app.route('/datasources/<int:ds_id>/fetch', methods=['POST'])
@login_required
def fetch_datasource(ds_id):
    ds = DataSource.query.filter_by(id=ds_id, user_id=current_user.id).first_or_404()
    if not ds.enabled:
        flash('Data source is disabled.', 'warning')
        return redirect(url_for('datasources'))
    try:
        inserted, skipped = _fetch_from_ttn(ds)
        flash(f'Fetched: {inserted} new records, {skipped} skipped.', 'success')
    except Exception as e:
        flash(f'Fetch failed: {e}', 'error')
    return redirect(url_for('datasources'))


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.route('/api/stats')
def api_stats():
    from datetime import timedelta
    now = datetime.utcnow()
    week_ago  = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_messages  = UplinkMessage.query.count()
    total_devices   = db.session.query(func.count(UplinkMessage.device_id.distinct())).scalar()
    last_week       = UplinkMessage.query.filter(UplinkMessage.real_timestamp >= week_ago).count()
    last_month      = UplinkMessage.query.filter(UplinkMessage.real_timestamp >= month_ago).count()
    active_devices  = db.session.query(func.count(UplinkMessage.device_id.distinct())).filter(
        UplinkMessage.real_timestamp >= month_ago
    ).scalar()
    last_msg = UplinkMessage.query.order_by(UplinkMessage.real_timestamp.desc()).first()

    return jsonify({
        'total_messages':  total_messages,
        'total_devices':   total_devices,
        'last_week':       last_week,
        'last_month':      last_month,
        'active_devices':  active_devices,
        'last_received_at': last_msg.received_at.isoformat() if last_msg else None,
        'last_real_timestamp': last_msg.real_timestamp.isoformat() if last_msg else None,
    })


@app.route('/api/positions')
@login_required
def api_positions():
    ds_ids = _user_ds_ids()
    devices_param = request.args.get('devices', '')
    from_time = request.args.get('from', '')
    to_time = request.args.get('to', '')
    last_only = request.args.get('last_only', 'false').lower() == 'true'

    query = UplinkMessage.query.filter(
        UplinkMessage.datasource_id.in_(ds_ids),
        UplinkMessage.latitude.isnot(None),
        UplinkMessage.longitude.isnot(None),
    )

    if devices_param:
        device_list = [d.strip() for d in devices_param.split(',') if d.strip()]
        if device_list:
            query = query.filter(UplinkMessage.device_id.in_(device_list))

    if from_time:
        dt = parse_datetime(from_time)
        if dt:
            query = query.filter(UplinkMessage.real_timestamp >= dt)

    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            query = query.filter(UplinkMessage.real_timestamp <= dt)

    query = query.order_by(UplinkMessage.device_id, UplinkMessage.real_timestamp.asc())
    messages = query.all()

    if last_only:
        seen = {}
        for m in reversed(messages):
            if m.device_id not in seen:
                seen[m.device_id] = m
        messages = list(seen.values())

    positions = [_msg_to_dict(m) for m in messages]
    device_ids = list({p['device_id'] for p in positions})
    latest_values = {}
    for device_id in device_ids:
        device_query = UplinkMessage.query.filter(
            UplinkMessage.datasource_id.in_(ds_ids),
            UplinkMessage.device_id == device_id,
        )
        if from_time:
            dt = parse_datetime(from_time)
            if dt:
                device_query = device_query.filter(UplinkMessage.real_timestamp >= dt)
        if to_time:
            dt = parse_datetime(to_time)
            if dt:
                device_query = device_query.filter(UplinkMessage.real_timestamp <= dt)

        latest_values[device_id] = {}
        for field in (
            'air_temperature',
            'external_temperature',
            'humidity',
            'battery_voltage',
            'light',
            'positioning_status',
            'event_status',
        ):
            column = getattr(UplinkMessage, field)
            latest = device_query.filter(
                column.isnot(None),
            ).order_by(UplinkMessage.real_timestamp.desc()).first()
            latest_values[device_id][field] = getattr(latest, field) if latest else None

    for position in positions:
        values = latest_values[position['device_id']]
        position['latest_air_temperature'] = values['air_temperature']
        position['latest_external_temperature'] = values['external_temperature']
        position['latest_humidity'] = values['humidity']
        position['latest_battery_voltage'] = values['battery_voltage']
        position['latest_light'] = values['light']
        position['latest_positioning_status'] = values['positioning_status']
        position['latest_event_status'] = values['event_status']

    return jsonify({'positions': positions, 'device_ids': device_ids})


@app.route('/api/devices')
@login_required
def api_devices():
    ds_ids = _user_ds_ids()
    devices_param = request.args.get('devices', '')
    from_time = request.args.get('from', '')
    to_time = request.args.get('to', '')

    filters = [UplinkMessage.datasource_id.in_(ds_ids)]
    if devices_param:
        device_list = [d.strip() for d in devices_param.split(',') if d.strip()]
        if device_list:
            filters.append(UplinkMessage.device_id.in_(device_list))
    if from_time:
        dt = parse_datetime(from_time)
        if dt:
            filters.append(UplinkMessage.real_timestamp >= dt)
    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            filters.append(UplinkMessage.real_timestamp <= dt)

    device_rows = db.session.query(UplinkMessage.device_id).filter(
        *filters
    ).distinct().all()
    now = datetime.utcnow()
    result = []
    for (device_id,) in device_rows:
        base = UplinkMessage.query.filter(
            *filters,
            UplinkMessage.device_id == device_id,
        )

        last_gps = base.filter(
            UplinkMessage.latitude.isnot(None),
            UplinkMessage.longitude.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()

        last_msg = base.order_by(UplinkMessage.real_timestamp.desc()).first()

        last_battery = base.filter(
            UplinkMessage.battery.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_battery_voltage = base.filter(
            UplinkMessage.battery_voltage.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_temperature = base.filter(
            UplinkMessage.air_temperature.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_external_temperature = base.filter(
            UplinkMessage.external_temperature.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_humidity = base.filter(
            UplinkMessage.humidity.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_light = base.filter(
            UplinkMessage.light.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_positioning_status = base.filter(
            UplinkMessage.positioning_status.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()
        last_event_status = base.filter(
            UplinkMessage.event_status.isnot(None),
        ).order_by(UplinkMessage.real_timestamp.desc()).first()

        count = base.count()

        seconds_ago = None
        if last_msg:
            seconds_ago = int((now - last_msg.real_timestamp).total_seconds())

        gps_seconds_ago = None
        if last_gps:
            gps_seconds_ago = int((now - last_gps.real_timestamp).total_seconds())

        result.append({
            'device_id': device_id,
            'last_latitude': last_gps.latitude if last_gps else None,
            'last_longitude': last_gps.longitude if last_gps else None,
            'last_gps_at': last_gps.real_timestamp.isoformat() if last_gps else None,
            'last_gps_received_at': last_gps.received_at.isoformat() if last_gps else None,
            'last_battery': last_battery.battery if last_battery else None,
            'last_battery_voltage': last_battery_voltage.battery_voltage if last_battery_voltage else None,
            'last_air_temperature': last_temperature.air_temperature if last_temperature else None,
            'last_external_temperature': (
                last_external_temperature.external_temperature if last_external_temperature else None
            ),
            'last_humidity': last_humidity.humidity if last_humidity else None,
            'last_light': last_light.light if last_light else None,
            'last_positioning_status': (
                last_positioning_status.positioning_status
                if last_positioning_status else None
            ),
            'last_event_status': last_event_status.event_status if last_event_status else None,
            'last_rssi': last_msg.rssi if last_msg else None,
            'last_channel_rssi': last_msg.channel_rssi if last_msg else None,
            'last_snr': last_msg.snr if last_msg else None,
            'last_channel_index': last_msg.channel_index if last_msg else None,
            'last_gateway_count': last_msg.gateway_count if last_msg else None,
            'last_spreading_factor': last_msg.spreading_factor if last_msg else None,
            'last_bandwidth': last_msg.bandwidth if last_msg else None,
            'last_coding_rate': last_msg.coding_rate if last_msg else None,
            'last_consumed_airtime': last_msg.consumed_airtime if last_msg else None,
            'last_real_timestamp': last_msg.real_timestamp.isoformat() if last_msg else None,
            'last_received_at': last_msg.received_at.isoformat() if last_msg else None,
            'seconds_ago': seconds_ago,
            'gps_seconds_ago': gps_seconds_ago,
            'message_count': count,
        })

    return jsonify({'devices': result})


@app.route('/api/device_colors', methods=['GET'])
@login_required
def api_device_colors():
    rows = DeviceColorPreference.query.filter_by(user_id=current_user.id).all()
    return jsonify({'colors': {r.device_id: r.color for r in rows}})


@app.route('/api/device_colors', methods=['POST'])
@login_required
def api_set_device_color():
    payload = request.get_json(silent=True) or {}
    device_id = str(payload.get('device_id', '')).strip()
    color = str(payload.get('color', '')).strip().upper()

    if not device_id:
        return jsonify({'error': 'device_id is required'}), 400
    if color not in DEVICE_COLORS:
        return jsonify({'error': 'Invalid color'}), 400

    pref = DeviceColorPreference.query.filter_by(
        user_id=current_user.id,
        device_id=device_id,
    ).first()
    if pref:
        pref.color = color
    else:
        pref = DeviceColorPreference(
            user_id=current_user.id,
            device_id=device_id,
            color=color,
        )
        db.session.add(pref)
    db.session.commit()

    return jsonify({'ok': True, 'device_id': device_id, 'color': color})


@app.route('/api/device_names', methods=['GET'])
@login_required
def api_device_names():
    rows = DeviceNamePreference.query.filter_by(user_id=current_user.id).all()
    return jsonify({'names': {r.device_id: r.short_name for r in rows}})


@app.route('/api/device_names', methods=['POST'])
@login_required
def api_set_device_name():
    payload = request.get_json(silent=True) or {}
    device_id = str(payload.get('device_id', '')).strip()
    short_name = str(payload.get('short_name', '')).strip()

    if not device_id:
        return jsonify({'error': 'device_id is required'}), 400
    if len(short_name) > 50:
        return jsonify({'error': 'Short name must be 50 characters or fewer'}), 400

    pref = DeviceNamePreference.query.filter_by(
        user_id=current_user.id,
        device_id=device_id,
    ).first()
    if short_name:
        if pref:
            pref.short_name = short_name
        else:
            db.session.add(DeviceNamePreference(
                user_id=current_user.id,
                device_id=device_id,
                short_name=short_name,
            ))
    elif pref:
        db.session.delete(pref)
    db.session.commit()

    return jsonify({'ok': True, 'device_id': device_id, 'short_name': short_name})


@app.route('/api/chart_data')
@login_required
def api_chart_data():
    ds_ids = _user_ds_ids()
    device_id = request.args.get('device_id', '')
    metric = request.args.get('metric', 'battery')
    from_time = request.args.get('from', '')
    to_time = request.args.get('to', '')

    allowed_metrics = {
        'battery', 'battery_voltage', 'air_temperature', 'external_temperature',
        'humidity', 'light', 'positioning_status', 'event_status',
        'rssi', 'channel_rssi', 'snr', 'channel_index', 'consumed_airtime',
    }
    if metric not in allowed_metrics:
        return jsonify({'error': 'Invalid metric'}), 400

    col = getattr(UplinkMessage, metric)
    query = UplinkMessage.query.filter(
        UplinkMessage.datasource_id.in_(ds_ids),
        col.isnot(None),
    )
    query = _apply_message_filters(
        query,
        devices=device_id,
        from_time=from_time,
        to_time=to_time,
    )

    query = query.order_by(UplinkMessage.real_timestamp.asc())
    messages = query.all()

    data = []
    for message in messages:
        value = getattr(message, metric)
        if metric == 'consumed_airtime':
            value = _airtime_milliseconds(value)
        if value is None:
            continue
        data.append({
            'device_id': message.device_id,
            'real_timestamp': message.real_timestamp.isoformat(),
            'received_at': message.received_at.isoformat(),
            metric: value,
        })

    return jsonify({'data': data})


@app.route('/api/messages/range')
@login_required
def api_messages_range():
    ds_ids = _user_ds_ids()
    result = db.session.query(
        func.min(UplinkMessage.real_timestamp),
        func.max(UplinkMessage.real_timestamp),
    ).filter(UplinkMessage.datasource_id.in_(ds_ids)).one()
    min_dt, max_dt = result
    return jsonify({
        'min': min_dt.isoformat() if min_dt else None,
        'max': max_dt.isoformat() if max_dt else None,
    })


@app.route('/api/messages')
@login_required
def api_messages():
    ds_ids = _user_ds_ids()
    devices_param = request.args.get('devices', '')
    from_time = request.args.get('from', '')
    to_time = request.args.get('to', '')

    query = UplinkMessage.query.filter(UplinkMessage.datasource_id.in_(ds_ids))
    query = _apply_message_filters(
        query,
        devices=devices_param,
        from_time=from_time,
        to_time=to_time,
    )

    query = query.order_by(UplinkMessage.real_timestamp.desc())
    messages = query.all()

    return jsonify({'messages': [_msg_to_dict(m) for m in messages]})


@app.route('/api/fetch_all', methods=['POST'])
@login_required
def api_fetch_all():
    sources = DataSource.query.filter_by(user_id=current_user.id, enabled=True).all()
    if not sources:
        return jsonify({'error': 'No enabled data sources configured', 'inserted': 0, 'skipped': 0}), 400

    total_inserted = total_skipped = 0
    errors = []
    for ds in sources:
        try:
            ins, skp = _fetch_from_ttn(ds)
            total_inserted += ins
            total_skipped += skp
        except Exception as e:
            errors.append(str(e))

    return jsonify({
        'inserted': total_inserted,
        'skipped': total_skipped,
        'errors': errors,
    })


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _user_ds_ids():
    """Return list of datasource IDs belonging to the current user."""
    return [ds.id for ds in DataSource.query.filter_by(user_id=current_user.id).with_entities(DataSource.id).all()]


def _apply_message_filters(query, devices='', from_time='', to_time=''):
    if devices:
        device_list = [d.strip() for d in devices.split(',') if d.strip()]
        if device_list:
            query = query.filter(UplinkMessage.device_id.in_(device_list))

    if from_time:
        dt = parse_datetime(from_time)
        if dt:
            query = query.filter(UplinkMessage.real_timestamp >= dt)

    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            query = query.filter(UplinkMessage.real_timestamp <= dt)

    for field_name in (
        'battery',
        'battery_voltage',
        'air_temperature',
        'external_temperature',
        'humidity',
        'light',
    ):
        min_value = _parse_float_arg(request.args.get(f'{field_name}_min', ''))
        max_value = _parse_float_arg(request.args.get(f'{field_name}_max', ''))
        column = getattr(UplinkMessage, field_name)
        if min_value is not None:
            query = query.filter(column >= min_value)
        if max_value is not None:
            query = query.filter(column <= max_value)

    return query


def _parse_float_arg(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _fetch_from_ttn(ds):
    """Fetch NDJSON from TTN, store in DB, record fetch result. Returns (inserted, skipped)."""
    try:
        response = http_requests.get(
            ds.api_url,
            headers={
                'Authorization': f'Bearer {ds.bearer_token}',
                'Accept': 'text/event-stream',
            },
            params={'last': ds.time_window},
            stream=True,
            timeout=60,
        )
        response.raise_for_status()
        inserted, skipped = parse_lines(response.iter_lines(), datasource_id=ds.id, decoder_type=ds.decoder_type)
        ds.last_fetched_at = datetime.utcnow()
        ds.last_fetch_status = f'OK (+{inserted} new, {skipped} skipped)'
        db.session.commit()
        return inserted, skipped
    except Exception as e:
        ds.last_fetched_at = datetime.utcnow()
        ds.last_fetch_status = f'Error: {e}'
        db.session.commit()
        raise


def _msg_to_dict(m):
    return {
        'id': m.id,
        'device_id': m.device_id,
        'received_at': m.received_at.isoformat(),
        'real_timestamp': m.real_timestamp.isoformat(),
        'latitude': m.latitude,
        'longitude': m.longitude,
        'battery': m.battery,
        'battery_voltage': m.battery_voltage,
        'air_temperature': m.air_temperature,
        'external_temperature': m.external_temperature,
        'humidity': m.humidity,
        'light': m.light,
        'rssi': m.rssi,
        'channel_rssi': m.channel_rssi,
        'snr': m.snr,
        'channel_index': m.channel_index,
        'gateway_count': m.gateway_count,
        'gateway_id': m.gateway_id,
        'gateway_eui': m.gateway_eui,
        'spreading_factor': m.spreading_factor,
        'bandwidth': m.bandwidth,
        'coding_rate': m.coding_rate,
        'consumed_airtime': m.consumed_airtime,
        'positioning_status': m.positioning_status,
        'event_status': m.event_status,
        'f_cnt': m.f_cnt,
    }


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------

import click

@app.cli.command('fetch-all')
def cli_fetch_all():
    """Fetch data from every enabled data source and store in the DB."""
    sources = DataSource.query.filter_by(enabled=True).all()
    if not sources:
        click.echo('No enabled data sources configured.')
        return

    total_ins = total_skp = 0
    for ds in sources:
        click.echo(f'  Fetching "{ds.name}" (last={ds.time_window})…', nl=False)
        try:
            ins, skp = _fetch_from_ttn(ds)
            click.echo(f' +{ins} inserted, {skp} skipped')
            total_ins += ins
            total_skp += skp
        except Exception as e:
            click.echo(f' ERROR: {e}')

    click.echo(f'Done — total inserted: {total_ins}, skipped: {total_skp}')


if __name__ == '__main__':
    app.run(debug=True)
