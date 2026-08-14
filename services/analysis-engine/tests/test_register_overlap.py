"""Tests for register-overlap (density warning) detection.

All fixtures use deterministic sine waves so results are fully reproducible.

Security Notes:
- Tests operate only on synthesized in-memory numpy arrays; no I/O.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.roles.overlap import (
    BANDS,
    band_energy_profile,
    detect_register_overlap,
)

SR = 22050
DURATION = 2.0


def _sine(freq: float, amplitude: float = 1.0) -> NDArray[np.float64]:
    """Generate a deterministic mono sine wave at the module sample rate.

    Args:
        freq: Tone frequency in Hz.
        amplitude: Peak amplitude.

    Returns:
        Mono float64 sine wave of ``DURATION`` seconds at ``SR``.
    """
    t = np.arange(int(SR * DURATION), dtype=np.float64) / SR
    return amplitude * np.sin(2.0 * np.pi * freq * t)


class TestBandEnergyProfile:
    """Tests for band_energy_profile."""

    def test_pure_low_tone_concentrates_in_low_band(self) -> None:
        """An 80 Hz sine puts nearly all energy in the low band."""
        profile = band_energy_profile(_sine(80.0), SR)
        assert profile["low"] > 0.95
        assert profile["mid"] < 0.05
        assert profile["high"] < 0.05

    def test_pure_tone_fractions_sum_to_one(self) -> None:
        """Band fractions for a pure in-band tone sum to approximately 1."""
        profile = band_energy_profile(_sine(440.0), SR)
        assert sum(profile.values()) > 0.99
        assert set(profile) == set(BANDS)

    def test_empty_audio_returns_all_zero(self) -> None:
        """An empty array yields 0.0 for every band."""
        profile = band_energy_profile(np.array([], dtype=np.float64), SR)
        assert profile == {"low": 0.0, "mid": 0.0, "high": 0.0}

    def test_silent_audio_returns_all_zero(self) -> None:
        """All-zero audio (total energy 0) yields 0.0 for every band."""
        profile = band_energy_profile(np.zeros(SR, dtype=np.float64), SR)
        assert profile == {"low": 0.0, "mid": 0.0, "high": 0.0}

    def test_invalid_sample_rate_returns_all_zero(self) -> None:
        """A non-positive sample rate fails safe with zero fractions."""
        profile = band_energy_profile(_sine(80.0), 0)
        assert profile == {"low": 0.0, "mid": 0.0, "high": 0.0}


class TestDetectRegisterOverlap:
    """Tests for detect_register_overlap."""

    def test_bass_and_other_low_register_overlap(self) -> None:
        """Bass at 80 Hz and other at 100 Hz overlap in the low band."""
        stems = {"bass": _sine(80.0), "other": _sine(100.0)}
        overlaps = detect_register_overlap(stems, SR)
        assert len(overlaps) == 1
        overlap = overlaps[0]
        assert overlap["stem_a"] == "bass"
        assert overlap["stem_b"] == "other"
        assert overlap["band"] == "low"
        assert overlap["severity"] > 0.9

    def test_separated_registers_report_no_overlap(self) -> None:
        """Bass at 80 Hz and other at 1 kHz occupy different bands."""
        stems = {"bass": _sine(80.0), "other": _sine(1000.0)}
        assert detect_register_overlap(stems, SR) == []

    def test_drums_excluded_even_if_low_heavy(self) -> None:
        """A low-heavy drums stem never appears in overlap results."""
        stems = {"bass": _sine(80.0), "drums": _sine(60.0)}
        assert detect_register_overlap(stems, SR) == []

    def test_silent_stems_return_empty(self) -> None:
        """Silent stems have no register occupancy and report no overlaps."""
        stems = {
            "bass": np.zeros(SR, dtype=np.float64),
            "other": np.zeros(SR, dtype=np.float64),
        }
        assert detect_register_overlap(stems, SR) == []

    def test_empty_stems_return_empty(self) -> None:
        """An empty stems dict reports no overlaps."""
        assert detect_register_overlap({}, SR) == []

    def test_single_pitched_stem_returns_empty(self) -> None:
        """Fewer than two pitched stems cannot overlap."""
        stems = {"bass": _sine(80.0), "drums": _sine(200.0)}
        assert detect_register_overlap(stems, SR) == []

    def test_pairs_alphabetical_and_sorted_by_severity(self) -> None:
        """Overlaps are alphabetically paired and sorted by severity desc."""
        stems = {
            "vocals": _sine(500.0),
            "other": _sine(600.0),
            "bass": _sine(80.0) + 0.6 * _sine(90.0),
        }
        # Add a weaker low component to vocals/other so only the strong
        # mid overlap and no spurious pairs appear.
        overlaps = detect_register_overlap(stems, SR)
        assert overlaps == [{"stem_a": "other", "stem_b": "vocals", "band": "mid", "severity": 1.0}]

    def test_multiple_overlaps_sorted_by_severity_descending(self) -> None:
        """Two overlapping pairs are ordered by descending severity."""
        low_strong = _sine(80.0)
        low_weak = 0.8 * _sine(100.0) + 0.75 * _sine(500.0)
        stems = {"bass": low_strong, "other": low_weak, "vocals": low_strong.copy()}
        overlaps = detect_register_overlap(stems, SR)
        severities = [float(o["severity"]) for o in overlaps]
        assert severities == sorted(severities, reverse=True)
        assert overlaps[0]["severity"] >= overlaps[-1]["severity"]
        pairs = {(o["stem_a"], o["stem_b"]) for o in overlaps}
        assert all(a < b for a, b in pairs)
        assert ("bass", "vocals") in pairs

    def test_malformed_stem_values_fail_safe(self) -> None:
        """Non-array stem values are treated as silent, not raised."""
        stems: dict[str, Any] = {"bass": None, "other": _sine(80.0)}
        assert detect_register_overlap(stems, SR) == []

    def test_threshold_is_respected(self) -> None:
        """Shares below the threshold do not trigger an overlap."""
        # Energy split evenly across the three bands (~0.33 each, below 0.35).
        mixed = _sine(100.0) + _sine(500.0) + _sine(3000.0)
        stems = {"bass": mixed, "other": mixed.copy()}
        assert detect_register_overlap(stems, SR) == []
        # The same stems overlap when the threshold is lowered.
        lowered = detect_register_overlap(stems, SR, threshold=0.2)
        assert lowered and lowered[0]["band"] in BANDS

    def test_excessively_large_audio_fails_safe(self) -> None:
        """Audio arrays larger than MAX_AUDIO_SIZE fail safe with zero fractions."""
        large_audio = np.zeros(100_000_001, dtype=np.float32)
        profile = band_energy_profile(large_audio, SR)
        assert profile == {"low": 0.0, "mid": 0.0, "high": 0.0}
