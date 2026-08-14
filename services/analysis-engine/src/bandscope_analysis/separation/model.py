"""Domain model for source separation."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, TypedDict

import numpy as np
from numpy.typing import NDArray


class StemCategory(str, Enum):
    """Canonical stem categories for source separation."""

    VOCALS = "vocals"
    BASS = "bass"
    DRUMS = "drums"
    KEYS = "keys"
    GUITAR = "guitar"
    OTHER = "other"


class StemDescriptor(TypedDict):
    """Descriptor for a single stem extracted from a mix."""

    stem_id: str
    category: str
    label: str
    confidence: Literal["low", "medium", "high"]


class SeparationResult(TypedDict):
    """Result returned by the source separation pipeline."""

    stems: list[StemDescriptor]
    separation_notes: str


AudioStemName = Literal["vocals", "bass", "drums", "other"]
AudioStemArray = NDArray[np.floating[Any]]
AudioStemPayload = dict[AudioStemName, AudioStemArray]
StemRoleTypeMap = dict[AudioStemName, Literal["vocal", "instrument"]]


class AudioSeparationResult(TypedDict):
    """Audio stem payload returned by local source separation."""

    stems: AudioStemPayload
    sample_rate: int
    duration_seconds: float
    chunk_count: int
    stem_role_types: StemRoleTypeMap
    separation_notes: str
