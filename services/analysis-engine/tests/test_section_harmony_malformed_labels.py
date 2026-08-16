"""Fail-isolated regressions for malformed section-harmony chord labels."""

from __future__ import annotations

import pytest

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


def test_blank_chord_label_is_skipped_without_erasing_neighboring_harmony() -> None:
    """Whitespace-only chord evidence must not become a buyer-visible chord entry."""
    result = summarize_section_harmony(
        [
            {"start_time": 0.0, "end_time": 1.0, "chord": "   "},
            {"start_time": 1.0, "end_time": 3.0, "chord": "G"},
        ],
        [(0.0, 3.0)],
    )

    assert result[0]["main_chord"] == "G"
    assert result[0]["chords"] == [{"chord": "G", "duration": pytest.approx(2.0)}]
    assert result[0]["chord_changes"] == 0
