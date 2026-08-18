"""Regression tests for Boolean section-boundary timing authority."""

from __future__ import annotations

from typing import Any

import pytest

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


@pytest.mark.parametrize("invalid_boundary", [(False, 2.0), (0.0, True)])
def test_boolean_section_boundary_is_skipped(invalid_boundary: tuple[object, object]) -> None:
    """Boolean endpoints must not be coerced into buyer-visible section timing."""
    boundaries: Any = [invalid_boundary, (2.0, 4.0)]
    segments = [
        {"start_time": 0.0, "end_time": 2.0, "chord": "C"},
        {"start_time": 2.0, "end_time": 4.0, "chord": "G"},
    ]

    result = summarize_section_harmony(segments, boundaries)

    assert len(result) == 1
    assert result[0]["start_time"] == 2.0
    assert result[0]["end_time"] == 4.0
    assert result[0]["main_chord"] == "G"
