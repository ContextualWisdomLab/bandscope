"""Recognized MIR metrics for BandScope accuracy acceptance."""

from __future__ import annotations

from collections.abc import Sequence


def duration_weighted_chord_recall(
    segments: Sequence[tuple[float, float, str]],
    expected_chord: str,
    start_seconds: float,
    end_seconds: float,
) -> float:
    """Return the annotated-interval fraction labeled with ``expected_chord``.

    This is a single-label duration-weighted recall on one interval, the
    smallest WCSR-style score that still answers “did the engine hear the
    known chord for most of the fixture?” (Odekerken et al., 2021; Raffel
    et al., 2014).

    Args:
        segments: ``(start, end, chord)`` estimates in seconds.
        expected_chord: Ground-truth chord symbol for the interval.
        start_seconds: Inclusive annotation start.
        end_seconds: Exclusive annotation end. Must be greater than start.

    Returns:
        A value in ``[0, 1]``.

    Raises:
        ValueError: If the annotation interval is empty or reversed.
    """
    if end_seconds <= start_seconds:
        raise ValueError("annotation end_seconds must be greater than start_seconds")

    covered = 0.0
    for segment_start, segment_end, chord in segments:
        overlap_start = max(start_seconds, segment_start)
        overlap_end = min(end_seconds, segment_end)
        if overlap_end > overlap_start and chord == expected_chord:
            covered += overlap_end - overlap_start
    return covered / (end_seconds - start_seconds)


def tempo_acc1(
    estimated_bpm: float,
    true_bpm: float,
    relative_tolerance: float = 0.04,
) -> bool:
    """Return whether estimated tempo is within Acc1 tolerance of the true tempo.

    Acc1 accepts an estimate within ``relative_tolerance`` of the true BPM and
    does not credit octave errors (Schreiber & Müller, 2020).

    Args:
        estimated_bpm: Engine tempo in beats per minute.
        true_bpm: Known fixture tempo. Must be positive.
        relative_tolerance: Non-negative Acc1 window. The default is 4%.

    Returns:
        ``True`` when the estimate is inside the Acc1 window.

    Raises:
        ValueError: If ``true_bpm`` is not positive or the tolerance is negative.
    """
    if true_bpm <= 0:
        raise ValueError("true_bpm must be positive")
    if relative_tolerance < 0:
        raise ValueError("relative_tolerance must be non-negative")
    return abs(estimated_bpm - true_bpm) / true_bpm <= relative_tolerance
