"""Fail-closed sample-rate contract for section-windowed overlap slicing."""

from __future__ import annotations

from typing import Any, cast

import numpy as np
import pytest

from bandscope_analysis.roles.overlap import slice_stems_to_window


@pytest.mark.parametrize("sample_rate", [float("nan"), float("inf")])
def test_slice_stems_rejects_non_finite_sample_rate(sample_rate: float) -> None:
    """Invalid sample-rate evidence must return empty stems instead of raising."""
    audio = np.ones(16, dtype=np.float64)

    result = slice_stems_to_window(
        {"bass": audio},
        0.0,
        1.0,
        cast(Any, sample_rate),
    )

    assert result["bass"].size == 0
