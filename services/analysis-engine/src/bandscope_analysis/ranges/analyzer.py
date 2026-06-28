"""Range analysis logic for detecting pitch ranges and overlaps."""

from __future__ import annotations

import logging
import re
from typing import Any, Literal

from ..sections.utils import validate_section
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

    # STRIX VULN FIX: Added strict length bounds to prevent ReDoS or bypass
    note = str(note)
    if len(note) > 10:
        return ("C", 4)

    # Note that `test_parse_note_all_digits` expects `_parse_note("4") == ("4", 4)`
    # The existing PoC expects this fallback.
    # The new STRIX finding points to regex backtracking.
    # We will split the regex logic for security.
    # We still need to support things like "4" -> ("4", 4) as per existing tests!

    # STRIX VULN FIX: Non-greedy, well-bounded regex
    # The issue reported was catastrophic backtracking with ^([A-Ga-g](?:#|b|sharp|flat)?)(.*)$
    match = re.match(r"^([A-Ga-g])([#b]|sharp|flat)?(.*)$", note)
    if not match:
        # Fallback for "4" or completely malformed ones
        return (note, 4)

    base_note, accidental, octave_str = match.groups()
    name = base_note + (accidental or "")

    if octave_str == "":
        return (name.capitalize(), 4)
    if octave_str == "-" or not re.match(r"^-?\d+$", octave_str):
        return (name.capitalize(), 4)

    # If the note name is valid, uppercase the first letter for uniformity
    name = name.capitalize()

    return (name, int(octave_str))


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

    # STRIX VULN FIX: Prevent division by zero when min_range is 0
    min_range = max(1, min(range_a_size, range_b_size))

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
            section_id = validate_section(section, i, logger)

            section_roles = (roles_by_section or {}).get(section_id, [])
            ranges: list[RangeInfo] = []
            overlaps: list[RangeOverlap] = []

            for role in section_roles:
                role_range = role.get("range")
                if isinstance(role_range, dict):
                    # STRIX VULN FIX: Validate constraints to prevent ReDoS
                    lowest_note = str(role_range.get("lowestNote", ""))
                    highest_note = str(role_range.get("highestNote", ""))
                    if len(lowest_note) > 10:
                        lowest_note = "C4"
                    if len(highest_note) > 10:
                        highest_note = "C4"

                    ranges.append(
                        {
                            "role_id": str(role.get("id", "")),
                            "role_name": str(role.get("name", "")),
                            "lowestNote": lowest_note,
                            "highestNote": highest_note,
                        }
                    )

            ranges_with_midi = []
            for r in ranges:
                ranges_with_midi.append(
                    (
                        r,
                        _note_to_midi(r["lowestNote"]),
                        _note_to_midi(r["highestNote"]),
                    )
                )

            # Sort ranges by lowest note MIDI value for efficient overlap detection
            ranges_with_midi.sort(key=lambda x: x[1])

            # Detect overlaps between all pairs of ranges
            for a_idx, (r_a, _, midi_high_a) in enumerate(ranges_with_midi):
                for r_b, midi_low_b, _ in ranges_with_midi[a_idx + 1 :]:
                    # Since ranges are sorted by lowest note, if the next range starts
                    # after the current one ends, no further ranges will overlap
                    if midi_low_b > midi_high_a:
                        break

                    # Check for overlap (simplified because we know midi_low_b >= midi_low_a)
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
