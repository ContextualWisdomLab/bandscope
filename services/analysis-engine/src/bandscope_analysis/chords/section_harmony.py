"""Per-section harmony summaries built from time-stamped chord segments.

The rehearsal domain model mandates that harmony is modeled per section:
a song must never collapse to one global chord answer. This module takes
the time-stamped chord segments produced by
:class:`~bandscope_analysis.chords.chord_recognizer.ChordRecognizer` and a
list of section boundaries, and produces an overlap-weighted chord timeline
for each section.

Security Notes:
- Pure in-memory computation over caller-provided lists; no file I/O,
  network access, or shell execution.
- Bounded: work is O(len(chord_segments) * len(boundaries)) with no
  recursion or unbounded allocation.
- Safe failure: malformed or non-finite timing is skipped and empty inputs
  produce empty (per-section) summaries; no exceptions escape the public API.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import TypedDict

_NO_CHORD_LABEL = "N"


class ChordDuration(TypedDict):
    """Total overlap-weighted duration of one chord within a section."""

    chord: str
    duration: float


class SectionHarmony(TypedDict):
    """Harmony summary for a single section window."""

    start_time: float
    end_time: float
    main_chord: str
    chords: list[ChordDuration]
    chord_changes: int


def _coerce_segment(segment: object) -> tuple[float, float, str] | None:
    """Extract ``(start, end, chord)`` from a possible chord-segment mapping.

    Args:
        segment: Candidate mapping with ``start_time``, ``end_time``, and
            ``chord`` keys. Non-mapping values are malformed entries and are
            skipped without discarding neighboring valid segments.

    Returns:
        A ``(start, end, chord)`` tuple, or ``None`` if the segment is
        malformed, non-finite, or has a non-positive span.
    """
    if not isinstance(segment, Mapping):
        return None

    start_raw = segment.get("start_time")
    end_raw = segment.get("end_time")
    chord_raw = segment.get("chord")
    if not isinstance(start_raw, int | float) or isinstance(start_raw, bool):
        return None
    if not isinstance(end_raw, int | float) or isinstance(end_raw, bool):
        return None
    if not isinstance(chord_raw, str):
        return None
    start = float(start_raw)
    end = float(end_raw)
    if not math.isfinite(start) or not math.isfinite(end) or end <= start:
        return None
    return (start, end, chord_raw)


def _summarize_one_section(
    segments: Sequence[tuple[float, float, str]],
    section_start: float,
    section_end: float,
) -> SectionHarmony:
    """Summarize the harmony of a single section window.

    Args:
        segments: Validated ``(start, end, chord)`` tuples in input order.
        section_start: Finite section window start time in seconds.
        section_end: Finite section window end time in seconds.

    Returns:
        A :class:`SectionHarmony` for the window. Segments contribute only
        the portion of their duration that overlaps the window.
    """
    durations: dict[str, float] = {}
    chord_changes = 0
    previous_chord: str | None = None

    for seg_start, seg_end, chord in segments:
        overlap = min(seg_end, section_end) - max(seg_start, section_start)
        if overlap <= 0.0:
            continue
        durations[chord] = durations.get(chord, 0.0) + overlap
        if previous_chord is not None and chord != previous_chord:
            chord_changes += 1
        previous_chord = chord

    chords: list[ChordDuration] = [
        {"chord": chord, "duration": duration}
        for chord, duration in sorted(durations.items(), key=lambda item: (-item[1], item[0]))
    ]

    main_chord = ""
    for entry in chords:
        if entry["chord"] != _NO_CHORD_LABEL:
            main_chord = entry["chord"]
            break

    return {
        "start_time": section_start,
        "end_time": section_end,
        "main_chord": main_chord,
        "chords": chords,
        "chord_changes": chord_changes,
    }


def summarize_section_harmony(
    chord_segments: Sequence[Mapping[str, object]],
    boundaries: Sequence[tuple[float, float]],
) -> list[SectionHarmony]:
    """Build a per-section harmony timeline from time-stamped chord segments.

    Each section receives an overlap-weighted chord duration table: a chord
    segment spanning a section boundary contributes only its in-section
    portion to that section. The dominant chord (``main_chord``) is the
    non-``"N"`` chord with the longest total duration in the section; the
    no-chord label ``"N"`` may still appear in the ``chords`` list.

    Args:
        chord_segments: Chord segments shaped like
            ``{"start_time": float, "end_time": float, "chord": str, ...}``
            (e.g. ``TrackedChord`` from the chord recognizer). Malformed,
            non-finite, and non-positive-span entries are skipped.
        boundaries: Section windows as ``(start, end)`` pairs in seconds.
            Windows must be finite and have ``end > start``; invalid windows
            are skipped.

    Returns:
        One :class:`SectionHarmony` per valid boundary, in boundary order.
        Empty ``boundaries`` yields ``[]``; empty or fully malformed
        ``chord_segments`` yields per-section empty summaries with
        ``main_chord == ""``. Never raises.
    """
    try:
        segments = [
            coerced
            for coerced in (_coerce_segment(segment) for segment in chord_segments)
            if coerced is not None
        ]

        summaries: list[SectionHarmony] = []
        for boundary in boundaries:
            try:
                section_start = float(boundary[0])
                section_end = float(boundary[1])
            except (IndexError, TypeError, ValueError):
                continue
            if (
                not math.isfinite(section_start)
                or not math.isfinite(section_end)
                or section_end <= section_start
            ):
                continue
            summaries.append(_summarize_one_section(segments, section_start, section_end))
        return summaries
    except Exception:
        return []
