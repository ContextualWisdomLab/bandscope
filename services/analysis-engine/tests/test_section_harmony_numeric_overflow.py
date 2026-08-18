"""Fail-isolated regressions for unrepresentable section-harmony timing."""

from typing import Any

import pytest

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


_HUGE_INTEGER = 10**10_000


def test_overflowing_segment_timing_is_skipped_without_erasing_neighboring_harmony() -> None:
    """An unrepresentable segment endpoint must not discard valid chord evidence."""
    segments: Any = [
        {"start_time": _HUGE_INTEGER, "end_time": _HUGE_INTEGER + 1, "chord": "C"},
        {"start_time": 0.0, "end_time": 2.0, "chord": "G"},
    ]

    result = summarize_section_harmony(segments, [(0.0, 2.0)])

    assert result[0]["main_chord"] == "G"
    assert result[0]["chords"] == [{"chord": "G", "duration": pytest.approx(2.0)}]
    assert result[0]["chord_changes"] == 0


def test_overflowing_boundary_is_skipped_without_erasing_neighboring_section() -> None:
    """An unrepresentable boundary endpoint must not discard later valid sections."""
    boundaries: Any = [(_HUGE_INTEGER, _HUGE_INTEGER + 1), (0.0, 2.0)]

    result = summarize_section_harmony(
        [{"start_time": 0.0, "end_time": 2.0, "chord": "G"}],
        boundaries,
    )

    assert len(result) == 1
    assert result[0]["start_time"] == 0.0
    assert result[0]["end_time"] == 2.0
    assert result[0]["main_chord"] == "G"
