import subprocess
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, session
from flask_migrate import Migrate
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from sqlalchemy import func
import requests as http_requests

from config import Config
from models import db, User, DataSource, UplinkMessage
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

app = Flask(__name__)
app.config.from_object(Config)

db.init_app(app)
app.jinja_env.globals['app_version'] = APP_VERSION


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


@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')


@app.route('/data')
@login_required
def data_view():
    return render_template('data.html')


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
    last_week       = UplinkMessage.query.filter(UplinkMessage.received_at >= week_ago).count()
    last_month      = UplinkMessage.query.filter(UplinkMessage.received_at >= month_ago).count()
    active_devices  = db.session.query(func.count(UplinkMessage.device_id.distinct())).filter(
        UplinkMessage.received_at >= month_ago
    ).scalar()
    last_msg = UplinkMessage.query.order_by(UplinkMessage.received_at.desc()).first()

    return jsonify({
        'total_messages':  total_messages,
        'total_devices':   total_devices,
        'last_week':       last_week,
        'last_month':      last_month,
        'active_devices':  active_devices,
        'last_received_at': last_msg.received_at.isoformat() if last_msg else None,
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
            query = query.filter(UplinkMessage.received_at >= dt)

    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            query = query.filter(UplinkMessage.received_at <= dt)

    query = query.order_by(UplinkMessage.device_id, UplinkMessage.received_at.asc())
    messages = query.all()

    if last_only:
        seen = {}
        for m in reversed(messages):
            if m.device_id not in seen:
                seen[m.device_id] = m
        messages = list(seen.values())

    positions = [_msg_to_dict(m) for m in messages]
    device_ids = list({p['device_id'] for p in positions})
    return jsonify({'positions': positions, 'device_ids': device_ids})


@app.route('/api/devices')
@login_required
def api_devices():
    ds_ids = _user_ds_ids()
    device_rows = db.session.query(UplinkMessage.device_id).filter(
        UplinkMessage.datasource_id.in_(ds_ids)
    ).distinct().all()
    now = datetime.utcnow()
    result = []
    for (device_id,) in device_rows:
        base = UplinkMessage.query.filter(
            UplinkMessage.datasource_id.in_(ds_ids),
            UplinkMessage.device_id == device_id,
        )

        last_gps = base.filter(
            UplinkMessage.latitude.isnot(None),
            UplinkMessage.longitude.isnot(None),
        ).order_by(UplinkMessage.received_at.desc()).first()

        last_msg = base.order_by(UplinkMessage.received_at.desc()).first()

        last_battery = base.filter(
            UplinkMessage.battery.isnot(None),
        ).order_by(UplinkMessage.received_at.desc()).first()

        count = base.count()

        seconds_ago = None
        if last_msg:
            seconds_ago = int((now - last_msg.received_at).total_seconds())

        result.append({
            'device_id': device_id,
            'last_latitude': last_gps.latitude if last_gps else None,
            'last_longitude': last_gps.longitude if last_gps else None,
            'last_gps_at': last_gps.received_at.isoformat() if last_gps else None,
            'last_battery': last_battery.battery if last_battery else None,
            'last_rssi': last_msg.rssi if last_msg else None,
            'last_channel_rssi': last_msg.channel_rssi if last_msg else None,
            'last_snr': last_msg.snr if last_msg else None,
            'last_channel_index': last_msg.channel_index if last_msg else None,
            'last_gateway_count': last_msg.gateway_count if last_msg else None,
            'last_spreading_factor': last_msg.spreading_factor if last_msg else None,
            'last_bandwidth': last_msg.bandwidth if last_msg else None,
            'last_coding_rate': last_msg.coding_rate if last_msg else None,
            'last_consumed_airtime': last_msg.consumed_airtime if last_msg else None,
            'last_received_at': last_msg.received_at.isoformat() if last_msg else None,
            'seconds_ago': seconds_ago,
            'message_count': count,
        })

    return jsonify({'devices': result})


@app.route('/api/chart_data')
@login_required
def api_chart_data():
    ds_ids = _user_ds_ids()
    device_id = request.args.get('device_id', '')
    metric = request.args.get('metric', 'battery')
    from_time = request.args.get('from', '')
    to_time = request.args.get('to', '')

    allowed_metrics = {'battery', 'rssi', 'channel_rssi', 'snr', 'gateway_count', 'channel_index'}
    if metric not in allowed_metrics:
        return jsonify({'error': 'Invalid metric'}), 400

    col = getattr(UplinkMessage, metric)
    query = UplinkMessage.query.filter(
        UplinkMessage.datasource_id.in_(ds_ids),
        col.isnot(None),
    )

    if device_id:
        query = query.filter(UplinkMessage.device_id == device_id)
    if from_time:
        dt = parse_datetime(from_time)
        if dt:
            query = query.filter(UplinkMessage.received_at >= dt)
    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            query = query.filter(UplinkMessage.received_at <= dt)

    query = query.order_by(UplinkMessage.received_at.asc())
    messages = query.all()

    return jsonify({
        'data': [
            {
                'device_id': m.device_id,
                'received_at': m.received_at.isoformat(),
                metric: getattr(m, metric),
            }
            for m in messages
        ]
    })


@app.route('/api/messages/range')
@login_required
def api_messages_range():
    ds_ids = _user_ds_ids()
    result = db.session.query(
        func.min(UplinkMessage.received_at),
        func.max(UplinkMessage.received_at),
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

    if devices_param:
        device_list = [d.strip() for d in devices_param.split(',') if d.strip()]
        if device_list:
            query = query.filter(UplinkMessage.device_id.in_(device_list))

    if from_time:
        dt = parse_datetime(from_time)
        if dt:
            query = query.filter(UplinkMessage.received_at >= dt)

    if to_time:
        dt = parse_datetime(to_time)
        if dt:
            query = query.filter(UplinkMessage.received_at <= dt)

    query = query.order_by(UplinkMessage.received_at.desc())
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
        'latitude': m.latitude,
        'longitude': m.longitude,
        'battery': m.battery,
        'rssi': m.rssi,
        'channel_rssi': m.channel_rssi,
        'snr': m.snr,
        'channel_index': m.channel_index,
        'gateway_count': m.gateway_count,
        'spreading_factor': m.spreading_factor,
        'bandwidth': m.bandwidth,
        'coding_rate': m.coding_rate,
        'consumed_airtime': m.consumed_airtime,
        'positioning_status': m.positioning_status,
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
