"""Fail-closed sample-rate contract for section-windowed overlap slicing."""

from __future__ import annotations

from typing import Any, cast

import numpy as np
import pytest

from bandscope_analysis.roles.overlap import band_energy_profile, slice_stems_to_window


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


def test_slice_stems_rejects_finite_rate_when_scaled_indices_overflow() -> None:
    """Finite inputs whose sample-index product overflows must still fail closed."""
    audio = np.ones(16, dtype=np.float64)

    result = slice_stems_to_window(
        {"bass": audio},
        10.0,
        11.0,
        cast(Any, 1e308),
    )

    assert result["bass"].size == 0


def test_band_energy_profile_rejects_boolean_sample_rate() -> None:
    """Boolean sample-rate evidence must not enter FFT frequency construction."""
    audio = np.ones(16, dtype=np.float64)

    profile = band_energy_profile(audio, cast(Any, True))

    assert profile == {"low": 0.0, "mid": 0.0, "high": 0.0}


@pytest.mark.parametrize(
    ("start_sec", "end_sec", "sample_rate"),
    [
        (False, 1.0, 22_050),
        (0.0, True, 22_050),
        (0.0, 1.0, True),
    ],
)
def test_slice_stems_rejects_boolean_temporal_evidence(
    start_sec: float | bool,
    end_sec: float | bool,
    sample_rate: int | bool,
) -> None:
    """Boolean time/rate values must fail closed instead of acting as 0 or 1."""
    audio = np.ones(22_050, dtype=np.float64)

    result = slice_stems_to_window(
        {"bass": audio},
        cast(Any, start_sec),
        cast(Any, end_sec),
        cast(Any, sample_rate),
    )

    assert result["bass"].size == 0
