"""Decoder for Dragino LHT65 uplinks via TTN.

This decoder expects TTN uplinks with a decoded_payload similar to:
    BatV, Bat_status, Ext_sensor, Hum_SHT, TempC_DS, TempC_SHT
"""
import json
from typing import Optional
from utils import parse_datetime
from .ttn_base import TTNBaseDecoder


class DraginoLHT65Decoder(TTNBaseDecoder):
    NAME = 'dragino_lht65'
    LABEL = 'Dragino LHT65 (TTN)'

    def _decode_payload(self, uplink: dict) -> Optional[dict]:
        decoded = uplink.get('decoded_payload')
        if not isinstance(decoded, dict):
            return {}

        battery = self._parse_battery_percentage(uplink, decoded)
        battery_voltage = self._to_float(decoded.get('BatV'))
        air_temperature = self._to_float(decoded.get('TempC_SHT'))
        external_temperature = self._to_float(decoded.get('TempC_DS'))
        humidity = self._to_float(decoded.get('Hum_SHT'))
        real_timestamp = self._pick_first_datetime(
            uplink.get('settings', {}).get('time'),
            uplink.get('received_at'),
        )

        extras = {}
        if decoded.get('Ext_sensor') is not None:
            extras['ext_sensor'] = str(decoded.get('Ext_sensor'))
        if decoded.get('Bat_status') is not None:
            extras['battery_status'] = decoded.get('Bat_status')

        return {
            'battery': battery,
            'battery_voltage': battery_voltage,
            'air_temperature': air_temperature,
            'external_temperature': external_temperature,
            'humidity': humidity,
            'event_status': json.dumps(extras, separators=(',', ':')) if extras else None,
            'real_timestamp': real_timestamp,
        }

    def _parse_battery_percentage(self, uplink: dict, decoded: dict):
        last_battery = uplink.get('last_battery_percentage')
        if isinstance(last_battery, dict):
            value = self._to_float(last_battery.get('value'))
            if value is not None:
                return value

        voltage = self._to_float(decoded.get('BatV'))
        if voltage is None:
            return None

        # Approximate Li-SOCl2 cell percentage from 2.5V-3.6V operating range.
        pct = ((voltage - 2.5) / 1.1) * 100.0
        return max(0.0, min(100.0, round(pct, 2)))

    @staticmethod
    def _pick_first_datetime(*values):
        for value in values:
            parsed = parse_datetime(value)
            if parsed is not None:
                return parsed
        return None

    @staticmethod
    def _to_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
