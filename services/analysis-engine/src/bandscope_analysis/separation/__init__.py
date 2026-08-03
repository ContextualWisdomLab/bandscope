"""Source separation module for categorizing roles into stem groups."""

from .model import SeparationResult, StemCategory, StemDescriptor
from .separator import StemSeparator

__all__ = [
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
]
