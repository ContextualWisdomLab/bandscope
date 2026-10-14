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
    PlayableStemArtifactReference,
    PlayableStemArtifactSetReference,
    build_playable_stem_artifact_set_reference,
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
    "PlayableStemArtifactReference",
    "PlayableStemArtifactSetReference",
    "StemRoleTypeMap",
    "AudioStemSeparator",
    "StemSeparator",
    "StemCategory",
    "StemDescriptor",
    "SeparationResult",
    "build_playable_stem_artifact_set_reference",
    "materialize_playable_stem_artifact_set",
]
