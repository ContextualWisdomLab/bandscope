"""Tests for register-overlap (density warning) detection.

All fixtures use deterministic sine waves so results are fully reproducible.

Security Notes:
- Tests operate only on synthesized in-memory numpy arrays; no I/O.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from bandscope_analysis.roles import overlap as overlap_module
from bandscope_analysis.roles.overlap import (
    BANDS,
    band_energy_profile,
    detect_register_overlap,
    format_overlap_warnings,
    slice_stems_to_window,
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

    def test_feature_does_not_invent_audio_sample_budget(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Leave audio-size admission to the canonical orchestration policy."""

        class PolicyOwnedAudio(np.ndarray):
            """Expose a policy-sized logical count without allocating that many samples."""

            @property
            def size(self) -> int:
                """Return a logical size above the removed feature-local threshold."""
                return 100_000_001

        audio = np.array([1.0], dtype=np.float64).view(PolicyOwnedAudio)
        fft_called = False

        def fake_rfft(values: np.ndarray) -> np.ndarray:
            """Prove the feature reaches DSP instead of applying its own admission cap."""
            nonlocal fft_called
            fft_called = True
            assert values.shape == (1,)
            return np.array([1.0], dtype=np.float64)

        monkeypatch.setattr(np.fft, "rfft", fake_rfft)
        monkeypatch.setattr(
            np.fft,
            "rfftfreq",
            lambda _count, d: np.array([100.0 if d > 0 else 0.0], dtype=np.float64),
        )

        profile = band_energy_profile(audio, SR)

        assert fft_called
        assert profile == {"low": 1.0, "mid": 0.0, "high": 0.0}


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

    def test_feature_does_not_invent_stem_count_budget(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Leave per-job admission limits to the canonical orchestration policy."""
        tiny = np.array([0.0], dtype=np.float64)
        stems = {f"stem_{index}": tiny for index in range(101)}
        profiled: list[str] = []

        def fake_profile(_audio: np.ndarray, _sr: int) -> dict[str, float]:
            """Return one active register without doing FFT work."""
            profiled.append("stem")
            return {"low": 1.0, "mid": 0.0, "high": 0.0}

        monkeypatch.setattr(overlap_module, "band_energy_profile", fake_profile)

        overlaps = detect_register_overlap(stems, SR)

        assert len(profiled) == 101
        assert len(overlaps) == 101 * 100 // 2
        assert all(overlap["band"] == "low" for overlap in overlaps)

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

    def test_equal_severity_keeps_declared_band_order(self) -> None:
        """Optimization must preserve the historical band order for severity ties."""
        broadband = _sine(100.0) + _sine(500.0) + _sine(3000.0)
        overlaps = detect_register_overlap(
            {"bass": broadband, "other": broadband.copy()},
            SR,
            threshold=0.2,
        )

        assert [overlap["band"] for overlap in overlaps] == list(BANDS)
        assert len({overlap["severity"] for overlap in overlaps}) == 1

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


class TestSliceStemsToWindow:
    """Tests for section-windowed stem slicing."""

    def test_window_keeps_only_the_requested_seconds(self) -> None:
        """A one-second window returns that many samples at the source rate."""
        audio = np.arange(SR * 2, dtype=np.float64)
        windowed = slice_stems_to_window({"bass": audio}, 1.0, 2.0, SR)

        assert windowed["bass"].tolist() == audio[SR:].tolist()

    def test_invalid_window_returns_empty_arrays(self) -> None:
        """Inverted, empty, or non-positive-rate windows fail closed."""
        audio = np.ones(SR, dtype=np.float64)

        assert slice_stems_to_window({"bass": audio}, 1.0, 0.5, SR)["bass"].size == 0
        assert slice_stems_to_window({"bass": audio}, 0.0, 1.0, 0)["bass"].size == 0
        assert slice_stems_to_window({"bass": None}, 0.0, 1.0, SR)["bass"].size == 0
        assert slice_stems_to_window({"bass": audio}, float("nan"), 1.0, SR)["bass"].size == 0
        assert (
            slice_stems_to_window({"bass": np.array([], dtype=np.float64)}, 0.0, 1.0, SR)[
                "bass"
            ].size
            == 0
        )
        assert slice_stems_to_window({"bass": audio}, 8.0, 9.0, SR)["bass"].size == 0
        assert slice_stems_to_window({"bass": audio}, 0.4, 0.6, 1)["bass"].size == 0


class TestFormatOverlapWarnings:
    """Tests for rehearsal-facing overlap copy."""

    def test_pair_warning_is_attached_only_to_unambiguous_role_identity(self) -> None:
        """Bass/other overlap warns bass without inventing a specific accompaniment role."""
        warnings = format_overlap_warnings(
            [
                {
                    "stem_a": "bass",
                    "stem_b": "other",
                    "band": "low",
                    "severity": 0.91,
                }
            ]
        )

        expected = (
            "The low register is crowded between Bass Guitar and accompaniment. "
            "Thin one part in this section so players can hear their cue."
        )
        assert warnings == {"bass-guitar": [expected]}

    def test_unknown_stems_and_empty_input_fail_closed(self) -> None:
        """Unknown names and empty overlap lists produce no role warnings."""
        assert format_overlap_warnings([]) == {}
        assert (
            format_overlap_warnings(
                [{"stem_a": "synth", "stem_b": "pad", "band": "mid", "severity": 0.8}]
            )
            == {}
        )

    def test_display_only_stem_does_not_raise_when_role_map_omits_it(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A later display label must not KeyError if it has no role authority."""
        monkeypatch.setitem(overlap_module._STEM_DISPLAY_NAMES, "synth", "Synth")
        warnings = format_overlap_warnings(
            [{"stem_a": "bass", "stem_b": "synth", "band": "low", "severity": 0.8}]
        )
        expected = (
            "The low register is crowded between Bass Guitar and Synth. "
            "Thin one part in this section so players can hear their cue."
        )
        assert warnings == {"bass-guitar": [expected]}

    def test_duplicate_records_and_vocal_pairs_dedupe(self) -> None:
        """Repeated records stay one warning and mixed accompaniment stays ambiguous."""
        record = {
            "stem_a": "other",
            "stem_b": "vocals",
            "band": "mid",
            "severity": 0.7,
        }
        warnings = format_overlap_warnings([record, record.copy()])
        expected = (
            "The mid register is crowded between accompaniment and Lead Vocal. "
            "Thin one part in this section so players can hear their cue."
        )
        assert warnings == {"lead-vocal": [expected]}
