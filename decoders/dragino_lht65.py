"""Decoder for Dragino LHT52/LHT65 uplinks via TTN.

This decoder expects TTN uplinks with a decoded_payload similar to:
    BatV / bat_mV / Bat_mV, Bat_status, Ext_sensor, Hum_SHT, TempC_DS, TempC_SHT
"""
import json
from typing import Optional
from utils import parse_datetime
from .ttn_base import TTNBaseDecoder


class DraginoLHT5XDecoder(TTNBaseDecoder):
    NAME = 'dragino_lht5x'
    LABEL = 'Dragino LHT52/LHT65 (TTN)'

    def _decode_payload(self, uplink: dict) -> Optional[dict]:
        decoded = uplink.get('decoded_payload')
        if not isinstance(decoded, dict):
            return {}

        battery = None
        battery_voltage = self._parse_battery_voltage(decoded)
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

    def _parse_battery_voltage(self, decoded: dict):
        for key in ('bat_mV', 'Bat_mV', 'bat_mv', 'Bat_mv'):
            millivolts = self._to_float(decoded.get(key))
            if millivolts is not None:
                return millivolts / 1000.0
        for key in ('BatV', 'bat_v', 'Bat_v'):
            volts = self._to_float(decoded.get(key))
            if volts is not None:
                return volts
        return None

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
