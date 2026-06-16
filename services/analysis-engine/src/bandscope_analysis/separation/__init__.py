"""Source separation module for audio stems and role stem groups."""

from .audio_separator import AudioSeparationConfig, AudioStemSeparator
from .demucs_separator import DemucsConfig, DemucsModelSeparator, is_demucs_available
from .model import (
    AudioSeparationResult,
    AudioStemArray,
    AudioStemName,
    AudioStemPayload,
    SeparationResult,
    StemCategory,
    StemDescriptor,
)
from .model_weights import ModelWeightConfig, ModelWeightManager
from .separator import StemSeparator

__all__ = [
    "AudioSeparationConfig",
    "AudioSeparationResult",
    "AudioStemArray",
    "AudioStemName",
    "AudioStemPayload",
    "AudioStemSeparator",
    "DemucsConfig",
    "DemucsModelSeparator",
    "ModelWeightConfig",
    "ModelWeightManager",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
    "is_demucs_available",
]
