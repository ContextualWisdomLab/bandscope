"""Regressions for malformed section-window shapes."""

from typing import Any

import pytest

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


@pytest.mark.parametrize("invalid_boundary", [(0.0,), None])
def test_malformed_boundary_shape_isolated_from_valid_neighbor(invalid_boundary: Any) -> None:
    """Short and non-subscriptable windows are skipped without erasing valid output."""
    boundaries: Any = [invalid_boundary, (0.0, 1.0)]

    result = summarize_section_harmony([], boundaries)

    assert result == [
        {
            "start_time": 0.0,
            "end_time": 1.0,
            "main_chord": "",
            "chords": [],
            "chord_changes": 0,
        }
    ]
