"""Domain model for chord analysis."""

from __future__ import annotations

from typing import Literal, TypedDict


class ChordLabel(TypedDict):
    """A single chord label attached to a section or role context."""

    chord: str
    functionLabel: str
    source: Literal["model", "user"]


class SectionChordSummary(TypedDict):
    """Chord summary for a single section."""

    section_id: str
    chords: list[ChordLabel]
    key_center: str
    confidence_level: Literal["low", "medium", "high"]
    confidence_source: Literal["model", "user"]


class ChordAnalysisResult(TypedDict):
    """Result returned by the chord analysis pipeline."""

    sections: list[SectionChordSummary]
    analysis_notes: str
