import re
import json
from datetime import datetime
from models import db, UplinkMessage


def parse_datetime(dt_str):
    """Parse ISO datetime string, handling nanoseconds and Z suffix."""
    if not dt_str:
        return None
    if dt_str.endswith('Z'):
        dt_str = dt_str[:-1]
    # Truncate sub-microsecond digits to 6 decimal places
    dt_str = re.sub(r'(\.\d{6})\d+', r'\1', dt_str)
    # Strip timezone offset if present (store as UTC naive)
    dt_str = re.sub(r'[+-]\d{2}:\d{2}$', '', dt_str)
    try:
        return datetime.fromisoformat(dt_str)
    except ValueError:
        try:
            return datetime.strptime(dt_str[:19], '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            return None


def parse_and_store(data, datasource_id=None, decoder_type=None):
    """Decode one raw JSON dict and store as UplinkMessage. Returns 1 if inserted, 0 if skipped."""
    from decoders.registry import get_decoder
    decoder = get_decoder(decoder_type)
    fields = decoder.decode(data)
    if not fields:
        return 0

    msg = UplinkMessage(
        datasource_id=datasource_id,
        device_id=fields['device_id'],
        received_at=fields['received_at'],
        f_cnt=fields.get('f_cnt'),
        longitude=fields.get('longitude'),
        latitude=fields.get('latitude'),
        battery=fields.get('battery'),
        rssi=fields.get('rssi'),
        channel_rssi=fields.get('channel_rssi'),
        snr=fields.get('snr'),
        channel_index=fields.get('channel_index'),
        gateway_count=fields.get('gateway_count'),
        spreading_factor=fields.get('spreading_factor'),
        bandwidth=fields.get('bandwidth'),
        coding_rate=fields.get('coding_rate'),
        consumed_airtime=fields.get('consumed_airtime'),
        positioning_status=fields.get('positioning_status'),
    )
    db.session.add(msg)
    try:
        db.session.commit()
        return 1
    except Exception:
        db.session.rollback()
        return 0


def parse_lines(lines, datasource_id=None, decoder_type=None):
    """Parse an iterable of NDJSON lines, return (inserted, skipped) counts."""
    inserted = skipped = 0
    for line in lines:
        line = line.strip() if isinstance(line, str) else line.decode('utf-8', errors='replace').strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            result = parse_and_store(data, datasource_id=datasource_id, decoder_type=decoder_type)
            if result:
                inserted += 1
            else:
                skipped += 1
        except (json.JSONDecodeError, Exception):
            skipped += 1
    return inserted, skipped
