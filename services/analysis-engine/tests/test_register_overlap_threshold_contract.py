"""Threshold safety regressions for register-overlap detection."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.roles.overlap import detect_register_overlap


@pytest.mark.parametrize("threshold", [0.0, -0.1, float("-inf")])
def test_silent_stems_never_become_overlap_evidence_at_nonpositive_thresholds(
    threshold: float,
) -> None:
    """Silent stems must not fabricate rehearsal warnings under edge thresholds."""
    silent = np.zeros(64, dtype=np.float64)

    assert (
        detect_register_overlap(
            {"bass": silent, "other": silent.copy()},
            22_050,
            threshold=threshold,
        )
        == []
    )


def test_boolean_threshold_fails_closed_instead_of_acting_like_one() -> None:
    """Boolean configuration must not be coerced into a 100% overlap threshold."""
    sample_count = 2_205
    timeline = np.arange(sample_count, dtype=np.float64) / 22_050
    tone = np.sin(2.0 * np.pi * 100.0 * timeline)

    assert (
        detect_register_overlap(
            {"bass": tone, "other": tone.copy()},
            22_050,
            threshold=True,
        )
        == []
    )
