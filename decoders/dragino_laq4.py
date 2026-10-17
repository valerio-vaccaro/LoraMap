"""Decoder for Dragino LAQ4 air quality sensors via TTN."""
from typing import Optional
from .ttn_base import TTNBaseDecoder


class DraginoLAQ4Decoder(TTNBaseDecoder):
    NAME = 'dragino_laq4'
    LABEL = 'Dragino LAQ4 Air Quality (TTN)'

    def _decode_payload(self, uplink: dict) -> Optional[dict]:
        decoded = uplink.get('decoded_payload')
        if not isinstance(decoded, dict):
            return {}

        def number(key):
            try:
                return float(decoded[key]) if decoded.get(key) is not None else None
            except (TypeError, ValueError):
                return None

        return {
            'battery_voltage': number('Bat_V'),
            'air_temperature': number('TempC_SHT'),
            'humidity': number('Hum_SHT'),
            'co2_ppm': number('CO2_ppm'),
            'tvoc_ppb': number('TVOC_ppb'),
            'work_mode': str(decoded['Work_mode']) if decoded.get('Work_mode') is not None else None,
            'alarm_status': str(decoded['Alarm_status']) if decoded.get('Alarm_status') is not None else None,
        }
