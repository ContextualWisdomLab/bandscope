"""Tests for tempo stability and tempo-change detection."""

from __future__ import annotations

import numpy as np

from bandscope_analysis.temporal.stability import analyze_tempo_stability

SAFE_DEFAULT = {
    "bpm_median": 0.0,
    "bpm_stdev": 0.0,
    "stability": "steady",
    "tempo_changes": [],
}


def _beats_from_intervals(intervals: list[float], start: float = 0.0) -> list[float]:
    """Build cumulative beat times from a list of inter-beat intervals."""
    beats = [start]
    for interval in intervals:
        beats.append(beats[-1] + interval)
    return beats


def test_steady_120_bpm() -> None:
    """Perfectly steady 120 BPM beats are steady with no tempo changes."""
    beats = [i * 0.5 for i in range(33)]
    result = analyze_tempo_stability(beats)

    assert result["bpm_median"] == 120.0
    assert result["bpm_stdev"] == 0.0
    assert result["stability"] == "steady"
    assert result["tempo_changes"] == []


def test_small_jitter_stays_steady_without_false_changes() -> None:
    """Deterministic +/-1% jitter stays steady and reports no changes."""
    intervals = [0.5 * (1.01 if i % 2 == 0 else 0.99) for i in range(32)]
    result = analyze_tempo_stability(_beats_from_intervals(intervals))

    assert result["stability"] == "steady"
    assert abs(result["bpm_median"] - 120.0) < 2.0
    assert result["tempo_changes"] == []


def test_moderate_jitter_is_loose_without_false_changes() -> None:
    """Deterministic +/-6% jitter is loose per thresholds, no changes."""
    intervals = [0.5 * (1.06 if i % 2 == 0 else 0.94) for i in range(32)]
    result = analyze_tempo_stability(_beats_from_intervals(intervals))

    assert result["stability"] == "loose"
    assert result["tempo_changes"] == []


def test_single_tempo_change_120_to_80() -> None:
    """16 beats at 120 then 16 at 80 yields exactly one change at the boundary."""
    beats = [i * 0.5 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.75)
    result = analyze_tempo_stability(beats)

    assert result["stability"] == "variable"
    assert len(result["tempo_changes"]) == 1
    change = result["tempo_changes"][0]
    assert abs(change["from_bpm"] - 120.0) < 1.0
    assert abs(change["to_bpm"] - 80.0) < 1.0
    # Boundary beat (last 120-spaced beat) is at 7.5 s.
    assert 7.0 <= change["time"] <= 8.5


def test_two_tempo_changes_are_reported_separately() -> None:
    """120 -> 80 -> 120 yields two distinct changes in order."""
    beats = [i * 0.5 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.75)
    for _ in range(16):
        beats.append(beats[-1] + 0.5)
    result = analyze_tempo_stability(beats)

    assert len(result["tempo_changes"]) == 2
    first, second = result["tempo_changes"]
    assert abs(first["from_bpm"] - 120.0) < 1.0
    assert abs(first["to_bpm"] - 80.0) < 1.0
    assert abs(second["from_bpm"] - 80.0) < 1.0
    assert abs(second["to_bpm"] - 120.0) < 1.0
    assert first["time"] < second["time"]


def test_single_dropped_beat_is_not_a_tempo_change() -> None:
    """One doubled inter-beat interval (dropped beat) is not a change."""
    beats = [i * 0.5 for i in range(33)]
    del beats[16]  # One missing beat -> a single 1.0 s interval.
    result = analyze_tempo_stability(beats)

    assert result["tempo_changes"] == []


def test_fewer_than_four_beats_returns_safe_default() -> None:
    """Fewer than 4 beats yields the documented safe default."""
    for beats in ([], [0.5], [0.0, 0.5], [0.0, 0.5, 1.0]):
        assert analyze_tempo_stability(beats) == SAFE_DEFAULT


def test_non_increasing_beat_times_return_safe_default() -> None:
    """Duplicate or out-of-order beat times yield the safe default."""
    assert analyze_tempo_stability([0.0, 0.5, 0.5, 1.0, 1.5]) == SAFE_DEFAULT
    assert analyze_tempo_stability([0.0, 1.0, 0.5, 1.5, 2.0]) == SAFE_DEFAULT


def test_non_finite_beat_times_return_safe_default() -> None:
    """NaN or infinite beat times yield the safe default."""
    assert analyze_tempo_stability([0.0, float("nan"), 1.0, 1.5]) == SAFE_DEFAULT
    assert analyze_tempo_stability([0.0, 0.5, float("inf"), 1.5]) == SAFE_DEFAULT


def test_denormal_interval_overflow_returns_safe_default() -> None:
    """An interval so small that BPM overflows yields the safe default."""
    assert analyze_tempo_stability([0.0, 5e-324, 1.0, 1.5, 2.0]) == SAFE_DEFAULT


def test_non_1d_input_returns_safe_default() -> None:
    """A 2-D array of beat times yields the safe default."""
    beats = np.zeros((4, 4), dtype=np.float64)
    assert analyze_tempo_stability(beats) == SAFE_DEFAULT


def test_short_track_skips_change_detection_but_reports_stats() -> None:
    """A track too short for windowed detection still reports statistics."""
    beats = [i * 0.5 for i in range(6)]
    result = analyze_tempo_stability(beats)

    assert result["bpm_median"] == 120.0
    assert result["stability"] == "steady"
    assert result["tempo_changes"] == []


def test_accepts_numpy_array_input() -> None:
    """A numpy float array is accepted like a plain sequence."""
    beats = np.arange(33, dtype=np.float64) * 0.5
    result = analyze_tempo_stability(beats)

    assert result["bpm_median"] == 120.0
    assert result["stability"] == "steady"
