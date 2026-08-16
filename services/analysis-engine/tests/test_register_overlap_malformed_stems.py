"""Fail-closed regressions for malformed register-overlap stem arrays."""

from __future__ import annotations

import numpy as np

from bandscope_analysis.roles.overlap import band_energy_profile, detect_register_overlap

_SAMPLE_RATE = 22_050
_ZERO_PROFILE = {"low": 0.0, "mid": 0.0, "high": 0.0}


def test_band_energy_profile_rejects_multichannel_array_without_raising() -> None:
    """A non-mono array must fail closed instead of escaping FFT shape errors."""
    stereo = np.ones((2, 16), dtype=np.float64)

    assert band_energy_profile(stereo, _SAMPLE_RATE) == _ZERO_PROFILE


def test_detect_register_overlap_isolates_multichannel_stem_as_no_evidence() -> None:
    """One malformed multichannel stem must not fabricate or abort overlap evidence."""
    stereo = np.ones((2, 16), dtype=np.float64)
    bass = np.sin(2.0 * np.pi * 80.0 * np.arange(_SAMPLE_RATE) / _SAMPLE_RATE)

    assert detect_register_overlap({"bass": bass, "other": stereo}, _SAMPLE_RATE) == []
