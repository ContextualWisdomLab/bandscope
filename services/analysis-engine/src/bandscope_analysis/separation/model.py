"""Domain model for source separation."""

from __future__ import annotations

from enum import Enum
from typing import Literal, TypedDict


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
