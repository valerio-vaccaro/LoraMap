"""Decoder for Seeed SenseCap T1000-A / T1000-B trackers via TTN.

Payload format: decoded_payload.messages — a list of lists, where each inner
element has measurementId and measurementValue.

Measurement IDs used:
    4197 → Longitude
    4198 → Latitude
    3000 → Battery (%)
    4097 → Air Temperature (°C)
    4199 → Light
    3576 → Positioning Status
    4200 → Event Status
"""
from typing import Optional
from datetime import datetime
import json
from .ttn_base import TTNBaseDecoder


class SensecapT1000ADecoder(TTNBaseDecoder):
    NAME  = 'sensecap_t1000a'
    LABEL = 'SenseCap T1000-A/B (TTN)'

    def _decode_payload(self, uplink: dict) -> Optional[dict]:
        decoded = uplink.get('decoded_payload')

        # ACK / confirmation frames have no decoded_payload — store envelope only
        if not decoded:
            return {}

        # err != 0 means a device-level decode error; skip entire record
        if decoded.get('err', 0) != 0:
            return None

        longitude = latitude = battery = air_temperature = light = None
        positioning_status = event_status = real_timestamp = None

        for group in decoded.get('messages', []):
            if not isinstance(group, list):
                continue
            for msg in group:
                if real_timestamp is None:
                    real_timestamp = self._parse_message_timestamp(msg.get('timestamp'))
                mid = str(msg.get('measurementId', ''))
                val = msg.get('measurementValue')
                if val is None:
                    continue
                if mid == '4197':
                    try:
                        longitude = float(val)
                    except (TypeError, ValueError):
                        pass
                elif mid == '4198':
                    try:
                        latitude = float(val)
                    except (TypeError, ValueError):
                        pass
                elif mid == '3000':
                    try:
                        battery = float(val)
                    except (TypeError, ValueError):
                        pass
                elif mid == '4097':
                    try:
                        air_temperature = float(val)
                    except (TypeError, ValueError):
                        pass
                elif mid == '4199':
                    try:
                        light = float(val)
                    except (TypeError, ValueError):
                        pass
                elif mid == '3576':
                    positioning_status = str(val)
                elif mid == '4200':
                    if isinstance(val, (dict, list)):
                        event_status = json.dumps(val, separators=(',', ':'))
                    else:
                        event_status = str(val)

        return {
            'longitude':          longitude,
            'latitude':           latitude,
            'battery':            battery,
            'air_temperature':    air_temperature,
            'light':              light,
            'positioning_status': positioning_status,
            'event_status':       event_status,
            'real_timestamp':     real_timestamp,
        }

    @staticmethod
    def _parse_message_timestamp(value):
        if value is None:
            return None
        try:
            timestamp = float(value)
        except (TypeError, ValueError):
            return None

        # SenseCAP decoded message timestamps are milliseconds since Unix epoch.
        if timestamp > 10_000_000_000:
            timestamp /= 1000

        try:
            return datetime.utcfromtimestamp(timestamp)
        except (OverflowError, OSError, ValueError):
            return None
