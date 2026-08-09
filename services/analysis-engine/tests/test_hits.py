"""Tests for stop-time and shared-hit detection."""

from __future__ import annotations

from unittest.mock import patch

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.temporal.hits import detect_shared_hits, detect_stop_time

SR = 22050


def _tone(duration: float, freq: float = 220.0, amp: float = 0.5) -> NDArray[np.float64]:
    """Generate a continuous sine tone."""
    t = np.linspace(0.0, duration, int(SR * duration), endpoint=False)
    return np.asarray(amp * np.sin(2 * np.pi * freq * t), dtype=np.float64)


def _click_track(duration: float, click_times: list[float]) -> NDArray[np.float64]:
    """Generate silence with short 10 ms bursts at the given times."""
    audio = np.zeros(int(SR * duration), dtype=np.float64)
    burst = int(0.01 * SR)
    rng = np.random.default_rng(42)
    for click_time in click_times:
        start = int(click_time * SR)
        audio[start : start + burst] = rng.uniform(-1.0, 1.0, burst)
    return audio


def _stop_time_stems(
    silence_start: float, silence_end: float, duration: float = 4.0
) -> dict[str, NDArray[np.float64]]:
    """Build four continuous stems all silenced in the same window."""
    stems: dict[str, NDArray[np.float64]] = {
        "vocals": _tone(duration, 220.0),
        "bass": _tone(duration, 80.0),
        "drums": np.asarray(
            0.5 * np.random.default_rng(7).uniform(-1.0, 1.0, int(SR * duration)),
            dtype=np.float64,
        ),
        "other": _tone(duration, 440.0),
    }
    lo, hi = int(silence_start * SR), int(silence_end * SR)
    for audio in stems.values():
        audio[lo:hi] = 0.0
    return stems


def test_detect_stop_time_finds_shared_break() -> None:
    """A 0.5 s all-stem break mid-track is reported as exactly one moment."""
    stems = _stop_time_stems(1.5, 2.0)

    moments = detect_stop_time(stems, SR)

    assert len(moments) == 1
    assert abs(moments[0]["start_time"] - 1.5) <= 0.1
    assert abs(moments[0]["end_time"] - 2.0) <= 0.1


def test_detect_stop_time_ignores_leading_and_trailing_silence() -> None:
    """Leading/trailing silence is not an internal break."""
    stems = _stop_time_stems(1.5, 2.0)
    lead, trail = int(0.5 * SR), int(3.5 * SR)
    for audio in stems.values():
        audio[:lead] = 0.0
        audio[trail:] = 0.0

    moments = detect_stop_time(stems, SR)

    assert len(moments) == 1
    assert abs(moments[0]["start_time"] - 1.5) <= 0.1
    assert abs(moments[0]["end_time"] - 2.0) <= 0.1


def test_detect_stop_time_requires_break_in_all_stems() -> None:
    """A break in only some stems is not stop-time."""
    stems = _stop_time_stems(1.5, 2.0)
    stems["other"] = _tone(4.0, 440.0)  # keeps playing through the break

    assert detect_stop_time(stems, SR) == []


def test_detect_stop_time_safe_failure_inputs() -> None:
    """Empty, zero-length, silent, malformed, and degenerate input yield []."""
    assert detect_stop_time({}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Shorter than one frame: no frames to analyze.
    assert detect_stop_time({"vocals": np.ones(16, dtype=np.float64)}, SR) == []
    # Degenerate sample rate: frame length collapses to zero.
    assert detect_stop_time({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_stop_time({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]


def test_detect_shared_hits_finds_aligned_impulses() -> None:
    """Clicks aligned in three stems at 1.0 s and 2.0 s are shared hits."""
    duration = 3.0
    stems: dict[str, NDArray[np.float64]] = {
        "vocals": _click_track(duration, [1.0, 2.0]),
        "bass": _click_track(duration, [1.0, 2.0]),
        "drums": _click_track(duration, [1.0, 2.0]),
        "other": _click_track(duration, [1.5]),  # lone impulse, never shared
    }

    hits = detect_shared_hits(stems, SR)

    assert len(hits) == 2
    for hit, expected in zip(hits, (1.0, 2.0), strict=True):
        assert abs(float(hit["time"]) - expected) <= 0.06
        assert hit["stem_count"] == 3
    assert all(abs(float(hit["time"]) - 1.5) > 0.06 for hit in hits)


def test_detect_shared_hits_two_active_stems_require_both() -> None:
    """With fewer than three active stems, all active stems must coincide."""
    duration = 3.0
    stems: dict[str, NDArray[np.float64]] = {
        "vocals": _click_track(duration, [1.0]),
        "bass": _click_track(duration, [1.0, 2.0]),
        "drums": np.zeros(int(SR * duration), dtype=np.float64),
        "other": np.zeros(int(SR * duration), dtype=np.float64),
    }

    hits = detect_shared_hits(stems, SR)

    assert len(hits) == 1
    assert abs(float(hits[0]["time"]) - 1.0) <= 0.06
    assert hits[0]["stem_count"] == 2


def test_detect_shared_hits_safe_failure_inputs() -> None:
    """Empty, silent, malformed, and degenerate input yield []."""
    assert detect_shared_hits({}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Degenerate sample rate must fail safe.
    assert detect_shared_hits({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_shared_hits({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]



def test_detect_stop_time_handles_exceptions() -> None:
    """detect_stop_time returns [] when internal logic raises an exception."""
    with patch(
        "bandscope_analysis.temporal.hits._detect_stop_time",
        side_effect=Exception("Test error"),
    ):
        assert detect_stop_time({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []

def test_detect_shared_hits_handles_exceptions() -> None:
    """detect_shared_hits returns [] when internal logic raises an exception."""
    with patch(
        "bandscope_analysis.temporal.hits._detect_shared_hits",
        side_effect=Exception("Test error"),
    ):
        assert detect_shared_hits({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
