"""Source separation module for audio stems and role stem groups."""

from .audio_separator import AudioSeparationConfig, AudioStemSeparator, ModelArtifactError
from .model import (
    AudioSeparationResult,
    AudioStemArray,
    AudioStemName,
    AudioStemPayload,
    SeparationResult,
    StemCategory,
    StemDescriptor,
    StemRoleTypeMap,
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
    "ModelArtifactError",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
]
