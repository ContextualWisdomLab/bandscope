"""Range analysis logic for detecting pitch ranges and overlaps."""

from __future__ import annotations

import logging
from typing import Any, Literal

from .model import (
    RangeAnalysisResult,
    RangeInfo,
    RangeOverlap,
    SectionRangeSummary,
)

logger = logging.getLogger(__name__)

# Chromatic note order for comparison (octave-independent).
_NOTE_ORDER = [
    "C",
    "C#",
    "Db",
    "D",
    "D#",
    "Eb",
    "E",
    "F",
    "F#",
    "Gb",
    "G",
    "G#",
    "Ab",
    "A",
    "A#",
    "Bb",
    "B",
]


def _parse_note(note: str) -> tuple[str, int]:
    """Parse a note string like 'C#4' into (name, octave).

    Security Notes:
    - Input is untrusted string from role range data.
    - Safe failure: returns default ('C', 4) for empty or malformed input.
    - No exec or eval; only character-level parsing with int conversion.
    - Bounded input: only processes single note strings.

    Args:
        note: A note string such as 'C4', 'G#3', 'Bb2'.

    Returns:
        A tuple of (note_name, octave).
    """
    if not note:
        return ("C", 4)
    # Find the boundary between note name and octave number by scanning
    # from the end of the string. Octave digits appear at the tail.
    for i in range(len(note) - 1, -1, -1):
        if note[i].isdigit() or (note[i] == "-" and i == len(note) - 1):
            # Still in the octave portion; continue scanning left.
            pass
        else:
            # Found the last non-digit character; split here.
            name = note[: i + 1]
            octave_str = note[i + 1 :]
            if octave_str and (octave_str.isdigit() or (octave_str[0] == "-")):
                return (name, int(octave_str))
            return (name, 4)
    # Entire string was digits (edge case); return as-is with default octave.
    return (note, 4)


def _note_to_midi(note: str) -> int:
    """Convert a note string to an approximate MIDI number for comparison.

    Args:
        note: A note string such as 'C4', 'G#3'.

    Returns:
        An integer MIDI-like value for ordering purposes.
    """
    name, octave = _parse_note(note)

    # Normalize enharmonics
    note_values = {
        "C": 0,
        "C#": 1,
        "Db": 1,
        "D": 2,
        "D#": 3,
        "Eb": 3,
        "E": 4,
        "F": 5,
        "F#": 6,
        "Gb": 6,
        "G": 7,
        "G#": 8,
        "Ab": 8,
        "A": 9,
        "A#": 10,
        "Bb": 10,
        "B": 11,
    }

    semitone = note_values.get(name, 0)
    return (octave + 1) * 12 + semitone


def _ranges_overlap(low_a: str, high_a: str, low_b: str, high_b: str) -> bool:
    """Check if two note ranges overlap.

    Args:
        low_a: Lowest note of range A.
        high_a: Highest note of range A.
        low_b: Lowest note of range B.
        high_b: Highest note of range B.

    Returns:
        True if the ranges overlap.
    """
    midi_low_a = _note_to_midi(low_a)
    midi_high_a = _note_to_midi(high_a)
    midi_low_b = _note_to_midi(low_b)
    midi_high_b = _note_to_midi(high_b)
    return midi_low_a <= midi_high_b and midi_low_b <= midi_high_a


def _overlap_severity(
    low_a: str, high_a: str, low_b: str, high_b: str
) -> Literal["low", "medium", "high"]:
    """Determine severity of range overlap.

    Args:
        low_a: Lowest note of range A.
        high_a: Highest note of range A.
        low_b: Lowest note of range B.
        high_b: Highest note of range B.

    Returns:
        Severity level: 'low', 'medium', or 'high'.
    """
    midi_low_a = _note_to_midi(low_a)
    midi_high_a = _note_to_midi(high_a)
    midi_low_b = _note_to_midi(low_b)
    midi_high_b = _note_to_midi(high_b)

    overlap_low = max(midi_low_a, midi_low_b)
    overlap_high = min(midi_high_a, midi_high_b)
    overlap_size = overlap_high - overlap_low

    range_a_size = midi_high_a - midi_low_a
    range_b_size = midi_high_b - midi_low_b
    min_range = min(range_a_size, range_b_size) if min(range_a_size, range_b_size) > 0 else 1

    ratio = overlap_size / min_range
    if ratio > 0.5:
        return "high"
    if ratio > 0.25:
        return "medium"
    return "low"


class RangeAnalyzer:
    """Analyzes pitch ranges and detects overlaps between roles."""

    def __init__(self) -> None:
        """Initialize the range analyzer."""
        pass

    def analyze(
        self,
        sections: list[dict[str, Any]],
        roles_by_section: dict[str, list[dict[str, Any]]] | None = None,
    ) -> RangeAnalysisResult:
        """Analyze ranges for roles in each section.

        Args:
            sections: List of section dicts (must contain 'id').
            roles_by_section: Optional mapping of section_id to roles with range data.

        Returns:
            RangeAnalysisResult containing per-section range summaries.
        """
        summaries: list[SectionRangeSummary] = []

        for i, section in enumerate(sections):
            if not isinstance(section, dict):
                logger.warning(
                    "Invalid section format at index %d; expected dict, got %s",
                    i,
                    type(section).__name__,
                )
                section_id = f"section-{i}"
            else:
                section_id = section.get("id", f"section-{i}")

            section_roles = (roles_by_section or {}).get(section_id, [])
            ranges: list[RangeInfo] = []
            overlaps: list[RangeOverlap] = []

            for role in section_roles:
                role_range = role.get("range")
                if isinstance(role_range, dict):
                    ranges.append(
                        {
                            "role_id": str(role.get("id", "")),
                            "role_name": str(role.get("name", "")),
                            "lowestNote": str(role_range.get("lowestNote", "")),
                            "highestNote": str(role_range.get("highestNote", "")),
                        }
                    )

            # Detect overlaps between all pairs of ranges
            for a_idx in range(len(ranges)):
                for b_idx in range(a_idx + 1, len(ranges)):
                    r_a = ranges[a_idx]
                    r_b = ranges[b_idx]
                    if _ranges_overlap(
                        r_a["lowestNote"],
                        r_a["highestNote"],
                        r_b["lowestNote"],
                        r_b["highestNote"],
                    ):
                        severity = _overlap_severity(
                            r_a["lowestNote"],
                            r_a["highestNote"],
                            r_b["lowestNote"],
                            r_b["highestNote"],
                        )
                        overlaps.append(
                            {
                                "role_a": r_a["role_id"],
                                "role_b": r_b["role_id"],
                                "overlap_region": (
                                    f"{r_a['role_name']} and {r_b['role_name']} overlap"
                                ),
                                "severity": severity,
                            }
                        )

            summaries.append(
                {
                    "section_id": section_id,
                    "ranges": ranges,
                    "overlaps": overlaps,
                }
            )

        return {
            "sections": summaries,
            "analysis_notes": f"Analyzed ranges for {len(summaries)} sections.",
        }
