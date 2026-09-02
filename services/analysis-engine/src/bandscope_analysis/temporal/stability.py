"""Tempo stability and tempo-change detection from beat times.

The temporal analyzer reports a single global BPM, but rehearsal planning
needs to know whether the band must handle tempo movement: rubato intros,
half-time bridges, or gradual drift. This module derives a per-beat local
BPM series from beat times (as produced by ``librosa.beat.beat_track``)
and summarizes how stable the tempo is and where sustained tempo changes
occur.

Thresholds (documented for tuning):

- Stability is classified from the coefficient of variation (CV) of the
  local BPM series (population standard deviation divided by the median):
  CV < 0.04 is "steady", CV < 0.10 is "loose", otherwise "variable".
- A tempo change is reported where the median local BPM of the 8 beats
  after a boundary differs from the median of the 8 beats before it by
  more than 15%. Using window medians makes the detector robust to a
  single outlier inter-beat interval (e.g. one dropped beat), so only
  sustained shifts are reported. Adjacent flagged boundaries are merged
  into a single change at the strongest boundary.

Security Notes:
    Pure in-memory numeric computation on a caller-provided sequence of
    floats. No file, network, or subprocess I/O. Runtime and memory are
    bounded linearly by the number of beats times a fixed window size.
    Malformed input (too few beats, non-monotonic or non-finite times)
    yields a safe default result instead of raising, so no exception
    escapes from ``analyze_tempo_stability``.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal, TypedDict

import numpy as np
from numpy.typing import NDArray

# Coefficient-of-variation thresholds for the stability label.
STEADY_CV_THRESHOLD = 0.04
LOOSE_CV_THRESHOLD = 0.10

# Sliding-window comparison parameters for tempo-change detection.
CHANGE_WINDOW_BEATS = 8
MIN_CHANGE_WINDOW_BEATS = 4
CHANGE_RATIO_THRESHOLD = 0.15

# Minimum number of beats required for any analysis.
MIN_BEATS = 4


class TempoChange(TypedDict):
    """A sustained tempo shift detected at a beat boundary.

    Attributes:
        time: Time in seconds of the beat where the new tempo starts.
        from_bpm: Median local BPM over the window before the boundary.
        to_bpm: Median local BPM over the window after the boundary.
    """

    time: float
    from_bpm: float
    to_bpm: float


class TempoStability(TypedDict):
    """Summary of tempo stability across a track.

    Attributes:
        bpm_median: Median of the per-beat local BPM series.
        bpm_stdev: Population standard deviation of the local BPM series.
        stability: "steady", "loose", or "variable" (see module docstring).
        tempo_changes: Sustained tempo shifts in chronological order.
    """

    bpm_median: float
    bpm_stdev: float
    stability: Literal["steady", "loose", "variable"]
    tempo_changes: list[TempoChange]


def _safe_default() -> TempoStability:
    """Return the safe default result for unusable input.

    Returns:
        A TempoStability with zeroed statistics, "steady" stability, and
        no tempo changes.
    """
    return {
        "bpm_median": 0.0,
        "bpm_stdev": 0.0,
        "stability": "steady",
        "tempo_changes": [],
    }


def _classify_stability(
    bpm_variation_coefficient: float,
) -> Literal["steady", "loose", "variable"]:
    """Map a coefficient of variation to a stability label.

    Args:
        bpm_variation_coefficient: Coefficient of variation of the local BPM series.

    Returns:
        "steady" if the coefficient is below 0.04, "loose" if it is below
        0.10, else "variable".
    """
    if bpm_variation_coefficient < STEADY_CV_THRESHOLD:
        return "steady"
    if bpm_variation_coefficient < LOOSE_CV_THRESHOLD:
        return "loose"
    return "variable"


def _summarize_run(
    tempo_change_run: list[tuple[int, float, float, float]],
    beat_times_array: NDArray[np.float64],
) -> TempoChange:
    """Collapse a run of adjacent flagged boundaries into one tempo change.

    The representative boundary is the one with the largest relative
    deviation; among (near-)ties, the middle boundary of the tied span is
    chosen so the reported time sits at the center of the transition.

    Args:
        tempo_change_run: Adjacent flagged boundaries as (index, deviation,
            before median BPM, after median BPM) tuples, in ascending index
            order.
        beat_times_array: Beat times in seconds, aligned with boundary indices.

    Returns:
        The merged TempoChange with rounded outputs.
    """
    max_deviation = max(flagged_boundary[1] for flagged_boundary in tempo_change_run)
    tied_boundaries = [
        flagged_boundary
        for flagged_boundary in tempo_change_run
        if flagged_boundary[1] >= max_deviation - 1e-9
    ]
    boundary_index, _, before_bpm, after_bpm = tied_boundaries[len(tied_boundaries) // 2]
    return {
        "time": round(float(beat_times_array[boundary_index]), 3),
        "from_bpm": round(before_bpm, 1),
        "to_bpm": round(after_bpm, 1),
    }


def _detect_tempo_changes(
    local_bpm_values: NDArray[np.float64],
    beat_times_array: NDArray[np.float64],
) -> list[TempoChange]:
    """Detect sustained tempo shifts in a local BPM series.

    Compares the median local BPM in a sliding window before and after
    each beat boundary; a boundary is flagged when the medians differ by
    more than ``CHANGE_RATIO_THRESHOLD``. Adjacent flagged boundaries are
    merged into a single change.

    Args:
        local_bpm_values: Per-beat local BPM series (one value per inter-beat
            interval); each value spans one consecutive beat interval.
        beat_times_array: Beat times in seconds; there is one more beat time
            than local BPM value.

    Returns:
        Detected tempo changes in chronological order; empty if the track
        is too short for a robust window comparison.
    """
    bpm_value_count = len(local_bpm_values)
    comparison_window_beats = min(CHANGE_WINDOW_BEATS, bpm_value_count // 2)
    if comparison_window_beats < MIN_CHANGE_WINDOW_BEATS:
        return []

    flagged_boundaries: list[tuple[int, float, float, float]] = []
    for boundary_index in range(
        comparison_window_beats,
        bpm_value_count - comparison_window_beats + 1,
    ):
        before_bpm_median = float(
            np.median(
                local_bpm_values[
                    boundary_index - comparison_window_beats : boundary_index
                ]
            )
        )
        after_bpm_median = float(
            np.median(
                local_bpm_values[
                    boundary_index : boundary_index + comparison_window_beats
                ]
            )
        )
        relative_bpm_deviation = (
            abs(after_bpm_median - before_bpm_median) / before_bpm_median
        )
        if relative_bpm_deviation > CHANGE_RATIO_THRESHOLD:
            flagged_boundaries.append(
                (
                    boundary_index,
                    relative_bpm_deviation,
                    before_bpm_median,
                    after_bpm_median,
                )
            )

    tempo_changes: list[TempoChange] = []
    tempo_change_run: list[tuple[int, float, float, float]] = []
    for flagged_boundary in flagged_boundaries:
        if (
            tempo_change_run
            and flagged_boundary[0] != tempo_change_run[-1][0] + 1
        ):
            tempo_changes.append(_summarize_run(tempo_change_run, beat_times_array))
            tempo_change_run = []
        tempo_change_run.append(flagged_boundary)
    if tempo_change_run:
        tempo_changes.append(_summarize_run(tempo_change_run, beat_times_array))
    return tempo_changes


def analyze_tempo_stability(
    beat_times: Sequence[float] | NDArray[np.floating[Any]],
) -> TempoStability:
    """Analyze tempo stability and detect sustained tempo changes.

    Derives inter-beat intervals from the given beat times, converts them
    to a per-beat local BPM series, and summarizes tempo behaviour:
    median BPM, BPM spread, a stability label, and a list of sustained
    tempo changes (see module docstring for thresholds).

    Args:
        beat_times: Beat onset times in seconds, as produced by
            ``librosa.beat.beat_track``. Expected to be finite and
            strictly increasing.

    Returns:
        A TempoStability dict. Unusable input (fewer than ``MIN_BEATS``
        beats, non-finite values, or non-increasing times) yields the
        safe default instead of raising.
    """
    beat_times_array: NDArray[np.float64] = np.asarray(beat_times, dtype=np.float64)
    if beat_times_array.ndim != 1 or len(beat_times_array) < MIN_BEATS:
        return _safe_default()
    if not np.all(np.isfinite(beat_times_array)):
        return _safe_default()

    beat_intervals = np.diff(beat_times_array)
    if not np.all(beat_intervals > 0.0):
        return _safe_default()

    with np.errstate(divide="ignore", over="ignore"):
        local_bpm_values: NDArray[np.float64] = 60.0 / beat_intervals
    if not np.all(np.isfinite(local_bpm_values)):
        return _safe_default()

    bpm_median = float(np.median(local_bpm_values))
    bpm_stdev = float(np.std(local_bpm_values))
    bpm_variation_coefficient = bpm_stdev / bpm_median

    return {
        "bpm_median": round(bpm_median, 2),
        "bpm_stdev": round(bpm_stdev, 2),
        "stability": _classify_stability(bpm_variation_coefficient),
        "tempo_changes": _detect_tempo_changes(local_bpm_values, beat_times_array),
    }
