"""Source separation module for audio stems and role stem groups."""

from .audio_separator import AudioSeparationConfig, AudioStemSeparator
from .model import (
    AudioSeparationResult,
    AudioStemArray,
    AudioStemName,
    AudioStemPayload,
    StemRoleTypeMap,
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
    "StemRoleTypeMap",
    "AudioStemSeparator",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
]
