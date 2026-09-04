"""Regression tests for MIR acceptance interval authority."""

from __future__ import annotations

import pytest

from bandscope_analysis.accuracy import duration_weighted_chord_recall


@pytest.mark.parametrize(
    ("segment_start", "segment_end"),
    [
        (2.0, 2.0),
        (3.0, 2.0),
    ],
)
def test_duration_weighted_recall_rejects_empty_or_reversed_estimate_intervals(
    segment_start: float,
    segment_end: float,
) -> None:
    """Malformed estimate intervals must fail closed before acceptance scoring."""
    with pytest.raises(ValueError, match="segment end_seconds must be greater than start_seconds"):
        duration_weighted_chord_recall(
            [(segment_start, segment_end, "C")],
            "C",
            0.0,
            4.0,
        )
