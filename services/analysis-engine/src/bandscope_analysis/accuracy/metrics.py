"""Recognized MIR metrics for BandScope accuracy acceptance."""

from __future__ import annotations

from collections.abc import Sequence

from bandscope_analysis.accuracy.numeric import is_finite_real


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
    et al., 2014). Matching estimate intervals are unioned after clipping to
    the annotation window, so overlapping estimates cannot count the same
    annotated time more than once. Non-finite, Boolean, empty, or reversed
    annotation and estimate timing is invalid acceptance evidence and fails
    closed before clipping.

    Args:
        segments: ``(start, end, chord)`` estimates in seconds. Segment timing
            values must be finite non-Boolean numbers and each end must be
            greater than its start.
        expected_chord: Ground-truth chord symbol for the interval.
        start_seconds: Inclusive finite non-Boolean annotation start.
        end_seconds: Exclusive finite non-Boolean annotation end. Must be
            greater than start.

    Returns:
        A value in ``[0, 1]``.

    Raises:
        ValueError: If annotation or estimate timing is Boolean, non-finite,
            empty, or reversed.
    """
    if not is_finite_real(start_seconds) or not is_finite_real(end_seconds):
        raise ValueError("annotation times must be finite numbers")
    if end_seconds <= start_seconds:
        raise ValueError("annotation end_seconds must be greater than start_seconds")

    matching_intervals: list[tuple[float, float]] = []
    for segment_start, segment_end, chord in segments:
        if not is_finite_real(segment_start) or not is_finite_real(segment_end):
            raise ValueError("segment times must be finite numbers")
        if segment_end <= segment_start:
            raise ValueError("segment end_seconds must be greater than start_seconds")
        overlap_start = max(start_seconds, segment_start)
        overlap_end = min(end_seconds, segment_end)
        if overlap_end > overlap_start and chord == expected_chord:
            matching_intervals.append((overlap_start, overlap_end))

    if not matching_intervals:
        return 0.0

    matching_intervals.sort(key=lambda interval: (interval[0], interval[1]))
    current_start, current_end = matching_intervals[0]
    covered = 0.0
    for interval_start, interval_end in matching_intervals[1:]:
        if interval_start <= current_end:
            current_end = max(current_end, interval_end)
            continue
        covered += current_end - current_start
        current_start, current_end = interval_start, interval_end
    covered += current_end - current_start
    return covered / (end_seconds - start_seconds)


def tempo_acc1(
    estimated_bpm: float,
    true_bpm: float,
    relative_tolerance: float = 0.04,
) -> bool:
    """Return whether estimated tempo is within Acc1 tolerance of the true tempo.

    Acc1 accepts an estimate within ``relative_tolerance`` of the true BPM and
    does not credit octave errors (Schreiber & Müller, 2020). Boolean or
    non-finite estimates, ground truth, or tolerances are invalid evidence and
    fail closed instead of being converted into an ordinary metric miss.

    Args:
        estimated_bpm: Engine tempo in beats per minute. Must be a finite
            non-Boolean number.
        true_bpm: Known fixture tempo. Must be a finite positive non-Boolean
            number.
        relative_tolerance: Finite non-negative non-Boolean Acc1 window. The
            default is 4%.

    Returns:
        ``True`` when the estimate is inside the Acc1 window.

    Raises:
        ValueError: If any metric input is Boolean/non-finite, ``true_bpm`` is
            not positive, or the tolerance is negative.
    """
    if not is_finite_real(estimated_bpm):
        raise ValueError("estimated_bpm must be finite")
    if not is_finite_real(true_bpm) or true_bpm <= 0:
        raise ValueError("true_bpm must be finite and positive")
    if not is_finite_real(relative_tolerance) or relative_tolerance < 0:
        raise ValueError("relative_tolerance must be finite and non-negative")
    return abs(estimated_bpm - true_bpm) / true_bpm <= relative_tolerance
