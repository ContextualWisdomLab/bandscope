"""Known-progression accuracy lock for section-level chord recovery.

Rehearsal buyers trust BandScope only when a real take produces the harmony
they will play. Single-chord unit tests are not enough: a verse-then-chorus
song must keep distinct section answers. This module synthesizes a two-section
rehearsal take (C major, then G major) and measures duration-weighted chord
symbol recall against those true labels (Harte et al., 2005; McVicar et al.,
2014).
"""

from __future__ import annotations

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer, TrackedChord
from bandscope_analysis.chords.section_harmony import summarize_section_harmony

_SAMPLE_RATE = 22050
_SECTION_SECONDS = 4.0
_MINIMUM_WEIGHTED_RECALL = 0.70
_C4_HZ = 261.63
_G4_HZ = 392.00


def _canonical_major_symbol(label: str) -> str:
    """Keep major-triad spellings; do not treat minor as a match.

    Args:
        label: Raw recognizer or annotation chord string.

    Returns:
        ``C`` or ``G`` for those major labels (including a ``:maj`` suffix),
        otherwise the stripped original so ``Cm`` cannot satisfy a C window.
    """
    stripped = label.strip()
    if stripped.endswith(":maj"):
        return stripped[: -len(":maj")]
    return stripped


def _major_triad_take(root_hz: float, duration_seconds: float, sample_rate: int) -> np.ndarray:
    """Render a dry major triad as equal-amplitude sines.

    Args:
        root_hz: Root frequency in hertz.
        duration_seconds: Take length in seconds.
        sample_rate: Samples per second.

    Returns:
        Mono float32 audio in ``[-1, 1]``.
    """
    sample_count = int(sample_rate * duration_seconds)
    time_axis = np.linspace(0.0, duration_seconds, sample_count, endpoint=False)
    major_third_hz = root_hz * (2.0 ** (4.0 / 12.0))
    perfect_fifth_hz = root_hz * (2.0 ** (7.0 / 12.0))
    waveform = (
        np.sin(2.0 * np.pi * root_hz * time_axis)
        + np.sin(2.0 * np.pi * major_third_hz * time_axis)
        + np.sin(2.0 * np.pi * perfect_fifth_hz * time_axis)
    ) / 3.0
    return waveform.astype(np.float32)


def _duration_weighted_symbol_recall(
    segments: list[TrackedChord],
    truth_windows: list[tuple[float, float, str]],
) -> float:
    """Score recovered segments against true section windows.

    The denominator is annotated duration so a silent or smeared boundary
    cannot inflate the score (McVicar et al., 2014).

    Args:
        segments: Time-stamped recognizer output.
        truth_windows: ``(start, end, canonical_chord)`` annotations.

    Returns:
        Overlap-weighted recall in ``[0, 1]``, or ``0.0`` when the annotation
        duration is not positive.
    """
    annotated_duration = sum(end - start for start, end, _chord in truth_windows)
    if annotated_duration <= 0.0:
        return 0.0

    matched_duration = 0.0
    for truth_start, truth_end, truth_chord in truth_windows:
        for segment in segments:
            overlap = min(segment["end_time"], truth_end) - max(segment["start_time"], truth_start)
            if overlap <= 0.0:
                continue
            if _canonical_major_symbol(segment["chord"]) == truth_chord:
                matched_duration += overlap
    return matched_duration / annotated_duration


def test_duration_weighted_symbol_recall_unions_duplicate_time() -> None:
    """Overlapping matching estimates must not count section time twice."""
    segments: list[TrackedChord] = [
        {"start_time": 0.0, "end_time": 3.0, "chord": "C", "confidence": "high"},
        {"start_time": 1.0, "end_time": 4.0, "chord": "C:maj", "confidence": "high"},
        {"start_time": 4.0, "end_time": 8.0, "chord": "G", "confidence": "high"},
    ]
    truth_windows = [(0.0, 4.0, "C"), (4.0, 8.0, "G")]

    assert _duration_weighted_symbol_recall(segments, truth_windows) == 1.0


def test_canonical_major_symbol_rejects_minor_as_major() -> None:
    """Keep ``Cm`` distinct from ``C`` so a minor estimate cannot pass."""
    assert _canonical_major_symbol("C") == "C"
    assert _canonical_major_symbol("C:maj") == "C"
    assert _canonical_major_symbol("Cm") == "Cm"
    assert _canonical_major_symbol("G:maj") == "G"
    assert _canonical_major_symbol("Gm") == "Gm"


def test_section_harmony_recovers_verse_c_then_chorus_g() -> None:
    """Recover C then G as section main chords from a two-section take.

    The take is a rehearsal-shaped verse/chorus pair: four seconds of C major
    followed by four seconds of G major. The recognizer runs on the mixed
    audio. Section summaries must keep those answers apart, and
    duration-weighted recall against the true windows must stay at or above
    70 percent so a boundary smear cannot hide a wrong-song result.
    """
    verse = _major_triad_take(_C4_HZ, _SECTION_SECONDS, _SAMPLE_RATE)
    chorus = _major_triad_take(_G4_HZ, _SECTION_SECONDS, _SAMPLE_RATE)
    take = np.concatenate([verse, chorus])
    boundaries = [(0.0, _SECTION_SECONDS), (_SECTION_SECONDS, _SECTION_SECONDS * 2.0)]
    truth_windows = [
        (0.0, _SECTION_SECONDS, "C"),
        (_SECTION_SECONDS, _SECTION_SECONDS * 2.0, "G"),
    ]

    segments = ChordRecognizer().recognize(take, sr=_SAMPLE_RATE)
    summaries = summarize_section_harmony(segments, boundaries)

    assert len(summaries) == 2
    assert _canonical_major_symbol(summaries[0]["main_chord"]) == "C"
    assert _canonical_major_symbol(summaries[1]["main_chord"]) == "G"
    assert _duration_weighted_symbol_recall(segments, truth_windows) >= _MINIMUM_WEIGHTED_RECALL


def test_section_harmony_keeps_later_c_off_the_opening_window() -> None:
    """Refuse a song-wide C answer when G occupies the first section.

    The same two triads in reverse order must not collapse to one global
    chord. Players need the opening chorus to stay G even though C arrives
    later. This is the temporal complement of the verse-then-chorus lock.
    """
    chorus = _major_triad_take(_G4_HZ, _SECTION_SECONDS, _SAMPLE_RATE)
    verse = _major_triad_take(_C4_HZ, _SECTION_SECONDS, _SAMPLE_RATE)
    take = np.concatenate([chorus, verse])
    boundaries = [(0.0, _SECTION_SECONDS), (_SECTION_SECONDS, _SECTION_SECONDS * 2.0)]
    truth_windows = [
        (0.0, _SECTION_SECONDS, "G"),
        (_SECTION_SECONDS, _SECTION_SECONDS * 2.0, "C"),
    ]

    segments = ChordRecognizer().recognize(take, sr=_SAMPLE_RATE)
    summaries = summarize_section_harmony(segments, boundaries)

    assert len(summaries) == 2
    assert _canonical_major_symbol(summaries[0]["main_chord"]) == "G"
    assert _canonical_major_symbol(summaries[1]["main_chord"]) == "C"
    assert _duration_weighted_symbol_recall(segments, truth_windows) >= _MINIMUM_WEIGHTED_RECALL
