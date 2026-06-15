"""Source separation module for audio stems and role stem groups."""

from .audio_separator import AudioSeparationConfig, AudioStemSeparator
from .model import (
    AudioSeparationResult,
    AudioStemArray,
    AudioStemName,
    AudioStemPayload,
    SeparationResult,
    StemCategory,
    StemDescriptor,
)
from .separator import StemSeparator

__all__ = [
    "AudioSeparationConfig",
    "AudioSeparationResult",
    "AudioStemArray",
    "AudioStemName",
    "AudioStemPayload",
    "AudioStemSeparator",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
]
