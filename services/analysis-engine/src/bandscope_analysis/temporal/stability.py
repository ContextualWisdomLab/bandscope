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


def _classify_stability(cv: float) -> Literal["steady", "loose", "variable"]:
    """Map a coefficient of variation to a stability label.

    Args:
        cv: Coefficient of variation of the local BPM series.

    Returns:
        "steady" if cv < 0.04, "loose" if cv < 0.10, else "variable".
    """
    if cv < STEADY_CV_THRESHOLD:
        return "steady"
    if cv < LOOSE_CV_THRESHOLD:
        return "loose"
    return "variable"


def _summarize_run(
    run: list[tuple[int, float, float, float]],
    beats: NDArray[np.float64],
) -> TempoChange:
    """Collapse a run of adjacent flagged boundaries into one tempo change.

    The representative boundary is the one with the largest relative
    deviation; among (near-)ties, the middle boundary of the tied span is
    chosen so the reported time sits at the center of the transition.

    Args:
        run: Adjacent flagged boundaries as (index, deviation, before
            median BPM, after median BPM) tuples, in ascending index order.
        beats: Beat times in seconds, aligned with boundary indices.

    Returns:
        The merged TempoChange with rounded outputs.
    """
    max_deviation = max(entry[1] for entry in run)
    ties = [entry for entry in run if entry[1] >= max_deviation - 1e-9]
    index, _, before_bpm, after_bpm = ties[len(ties) // 2]
    return {
        "time": round(float(beats[index]), 3),
        "from_bpm": round(before_bpm, 1),
        "to_bpm": round(after_bpm, 1),
    }


def _detect_tempo_changes(
    bpms: NDArray[np.float64],
    beats: NDArray[np.float64],
) -> list[TempoChange]:
    """Detect sustained tempo shifts in a local BPM series.

    Compares the median local BPM in a sliding window before and after
    each beat boundary; a boundary is flagged when the medians differ by
    more than ``CHANGE_RATIO_THRESHOLD``. Adjacent flagged boundaries are
    merged into a single change.

    Args:
        bpms: Per-beat local BPM series (one value per inter-beat
            interval); ``bpms[i]`` spans beats ``i`` to ``i + 1``.
        beats: Beat times in seconds; ``len(beats) == len(bpms) + 1``.

    Returns:
        Detected tempo changes in chronological order; empty if the track
        is too short for a robust window comparison.
    """
    n_bpm = len(bpms)
    window = min(CHANGE_WINDOW_BEATS, n_bpm // 2)
    if window < MIN_CHANGE_WINDOW_BEATS:
        return []

    flagged: list[tuple[int, float, float, float]] = []
    for k in range(window, n_bpm - window + 1):
        before = float(np.median(bpms[k - window : k]))
        after = float(np.median(bpms[k : k + window]))
        deviation = abs(after - before) / before
        if deviation > CHANGE_RATIO_THRESHOLD:
            flagged.append((k, deviation, before, after))

    changes: list[TempoChange] = []
    run: list[tuple[int, float, float, float]] = []
    for entry in flagged:
        if run and entry[0] != run[-1][0] + 1:
            changes.append(_summarize_run(run, beats))
            run = []
        run.append(entry)
    if run:
        changes.append(_summarize_run(run, beats))
    return changes


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
    beats: NDArray[np.float64] = np.asarray(beat_times, dtype=np.float64)
    if beats.ndim != 1 or len(beats) < MIN_BEATS:
        return _safe_default()
    if not np.all(np.isfinite(beats)):
        return _safe_default()

    intervals = np.diff(beats)
    if not np.all(intervals > 0.0):
        return _safe_default()

    with np.errstate(divide="ignore", over="ignore"):
        bpms: NDArray[np.float64] = 60.0 / intervals
    if not np.all(np.isfinite(bpms)):
        return _safe_default()

    bpm_median = float(np.median(bpms))
    bpm_stdev = float(np.std(bpms))
    cv = bpm_stdev / bpm_median

    return {
        "bpm_median": round(bpm_median, 2),
        "bpm_stdev": round(bpm_stdev, 2),
        "stability": _classify_stability(cv),
        "tempo_changes": _detect_tempo_changes(bpms, beats),
    }
