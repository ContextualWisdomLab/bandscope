"""Regression for section windows that cannot be indexed."""

from typing import Any

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


def test_unsubscriptable_boundary_is_skipped_without_losing_valid_neighbor() -> None:
    """An invalid boundary object must not erase the next valid section summary."""
    boundaries: Any = [object(), (0.0, 2.0)]
    segments = [{"start_time": 0.0, "end_time": 2.0, "chord": "D"}]

    result = summarize_section_harmony(segments, boundaries)

    assert len(result) == 1
    assert result[0]["start_time"] == 0.0
    assert result[0]["end_time"] == 2.0
    assert result[0]["main_chord"] == "D"
