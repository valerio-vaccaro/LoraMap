"""Decoder registry — maps string keys to decoder instances.

To add a new decoder:
1. Create a new module in this package that subclasses BaseDecoder (or TTNBaseDecoder).
2. Import it here and add it to DECODERS.
"""
from typing import Dict, List, Tuple
from .dragino_lht65 import DraginoLHT5XDecoder
from .sensecap_t1000a import SensecapT1000ADecoder

dragino_lht5x = DraginoLHT5XDecoder()

DECODERS: Dict = {
    SensecapT1000ADecoder().NAME: SensecapT1000ADecoder(),
    dragino_lht5x.NAME: dragino_lht5x,
    'dragino_lht65': dragino_lht5x,
}

# List of (key, label) tuples for use in HTML <select> elements
DECODER_CHOICES: List[Tuple[str, str]] = [
    (key, dec.LABEL) for key, dec in DECODERS.items() if key != 'dragino_lht65'
]

DEFAULT_DECODER = 'sensecap_t1000a'


def get_decoder(name: str):
    """Return the decoder for *name*, falling back to the default."""
    return DECODERS.get(name) or DECODERS[DEFAULT_DECODER]
