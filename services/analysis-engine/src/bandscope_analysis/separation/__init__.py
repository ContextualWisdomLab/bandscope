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
    StemRoleTypeMap,
)
from .playback_artifacts import (
    CANONICAL_PLAYBACK_STEM_KINDS,
    NativePlayableStemArtifact,
    NativePlayableStemArtifactSet,
    PlaybackStemKind,
    materialize_playable_stem_artifact_set,
)
from .separator import StemSeparator

__all__ = [
    "AudioSeparationConfig",
    "AudioSeparationResult",
    "AudioStemArray",
    "AudioStemName",
    "AudioStemPayload",
    "CANONICAL_PLAYBACK_STEM_KINDS",
    "NativePlayableStemArtifact",
    "NativePlayableStemArtifactSet",
    "PlaybackStemKind",
    "StemRoleTypeMap",
    "AudioStemSeparator",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
    "materialize_playable_stem_artifact_set",
]
