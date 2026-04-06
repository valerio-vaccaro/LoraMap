"""Shared TTN envelope parsing.

Subclass this and implement _decode_payload() to add support for a new
TTN-connected device type without repeating the envelope boilerplate.
"""
from typing import Optional
from utils import parse_datetime
from .base import BaseDecoder


class TTNBaseDecoder(BaseDecoder):
    """Handles the TTN envelope (device_id, received_at, rx_metadata, LoRa
    settings, f_cnt, consumed_airtime).  Delegates payload decoding to
    _decode_payload(), which subclasses must implement.
    """

    def decode(self, raw: dict) -> Optional[dict]:
        result = raw.get('result', {})
        if not result:
            return None

        device_id = result.get('end_device_ids', {}).get('device_id')
        received_at_str = result.get('received_at')
        if not device_id or not received_at_str:
            return None

        received_at = parse_datetime(received_at_str)
        if not received_at:
            return None

        uplink = result.get('uplink_message', {})

        # Radio metadata (first gateway wins for RSSI/SNR)
        rx_metadata = uplink.get('rx_metadata', [])
        gateway_count = len(rx_metadata)
        rssi = channel_rssi = snr = channel_index = None
        if rx_metadata:
            gw = rx_metadata[0]
            rssi          = gw.get('rssi')
            channel_rssi  = gw.get('channel_rssi')
            snr           = gw.get('snr')
            channel_index = gw.get('channel_index')

        # LoRa physical layer
        lora = uplink.get('settings', {}).get('data_rate', {}).get('lora', {})
        spreading_factor = lora.get('spreading_factor')
        bandwidth        = lora.get('bandwidth')
        coding_rate      = lora.get('coding_rate')

        fields = {
            'device_id':        device_id,
            'received_at':      received_at,
            'f_cnt':            uplink.get('f_cnt'),
            'consumed_airtime': uplink.get('consumed_airtime'),
            'rssi':             rssi,
            'channel_rssi':     channel_rssi,
            'snr':              snr,
            'channel_index':    channel_index,
            'gateway_count':    gateway_count,
            'spreading_factor': spreading_factor,
            'bandwidth':        bandwidth,
            'coding_rate':      coding_rate,
        }

        # Merge in device-specific payload fields (may return None to skip)
        payload_fields = self._decode_payload(uplink)
        if payload_fields is None:
            return None
        fields.update(payload_fields)
        return fields

    def _decode_payload(self, uplink: dict) -> Optional[dict]:
        """Decode the device-specific decoded_payload section.

        Return a dict of additional fields to merge, or None to skip.
        An empty dict is fine for messages that carry no payload data
        (e.g. pure ACKs) — the envelope fields are still stored.
        """
        raise NotImplementedError
