"""Decoder for Seeed SenseCap T1000-A / T1000-B trackers via TTN.

Payload format: decoded_payload.messages — a list of lists, where each inner
element has measurementId and measurementValue.

Measurement IDs used:
    4197 → Longitude
    4198 → Latitude
    3000 → Battery (%)
    3576 → Positioning Status
"""
from typing import Optional
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

        longitude = latitude = battery = positioning_status = None

        for group in decoded.get('messages', []):
            if not isinstance(group, list):
                continue
            for msg in group:
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
                elif mid == '3576':
                    positioning_status = str(val)

        return {
            'longitude':          longitude,
            'latitude':           latitude,
            'battery':            battery,
            'positioning_status': positioning_status,
        }
