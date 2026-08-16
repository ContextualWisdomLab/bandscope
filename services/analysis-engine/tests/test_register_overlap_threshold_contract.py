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
