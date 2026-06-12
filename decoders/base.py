from abc import ABC, abstractmethod
from typing import Optional


class BaseDecoder(ABC):
    """Abstract base for all device decoders.

    Each decoder is responsible for turning one raw JSON line (already parsed
    to a dict) into a normalised field dict that can be stored as an
    UplinkMessage, or returning None to indicate the record should be skipped.
    """

    #: Short machine-readable key used in the DB and registry (e.g. 'sensecap_t1000a')
    NAME: str = None
    #: Human-readable label shown in the UI
    LABEL: str = None

    @abstractmethod
    def decode(self, raw: dict) -> Optional[dict]:
        """Parse one raw JSON dict.

        Returns a dict with at minimum:
            device_id   (str)
            received_at (datetime)
            real_timestamp (datetime, optional; defaults to received_at)

        And optionally any of:
            latitude, longitude, battery, air_temperature, light,
            positioning_status, event_status,
            rssi, channel_rssi, snr, channel_index, gateway_count,
            gateway_id, gateway_eui,
            spreading_factor, bandwidth, coding_rate, consumed_airtime, f_cnt

        Return None to skip this record entirely.
        """
        raise NotImplementedError
