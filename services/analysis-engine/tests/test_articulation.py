"""Tests for sustained-versus-choppy articulation detection."""

from typing import Any

import numpy as np
import pytest
from numpy.typing import NDArray

from bandscope_analysis.roles import articulation
from bandscope_analysis.roles.articulation import (
    analyze_articulation,
    analyze_stem_articulation,
)

SR = 22050

SAFE_DEFAULT = {
    "character": "mixed",
    "onset_density_per_s": 0.0,
    "duty_cycle": 0.0,
}


def _sine(duration_s: float, freq: float = 220.0, amplitude: float = 0.5) -> NDArray[np.float32]:
    """Generate a mono sine wave."""
    t = np.arange(int(duration_s * SR), dtype=np.float32) / SR
    return (amplitude * np.sin(2.0 * np.pi * freq * t)).astype(np.float32)


def test_continuous_sine_is_sustained() -> None:
    """A continuous organ-pad-like sine is classified as sustained."""
    audio = _sine(5.0)
    result = analyze_articulation(audio, SR)
    assert result["character"] == "sustained"
    duty = result["duty_cycle"]
    assert isinstance(duty, float)
    assert duty > 0.9
    density = result["onset_density_per_s"]
    assert isinstance(density, float)
    assert density < 1.5


def test_staccato_bursts_are_choppy() -> None:
    """Short 50 ms bursts at 4 per second with silence between are choppy."""
    duration_s = 5.0
    audio = np.zeros(int(duration_s * SR), dtype=np.float32)
    burst = _sine(0.05, freq=880.0)
    period = int(0.25 * SR)  # 4 bursts per second
    for start in range(0, audio.size - burst.size, period):
        audio[start : start + burst.size] = burst
    result = analyze_articulation(audio, SR)
    assert result["character"] == "choppy"
    duty = result["duty_cycle"]
    assert isinstance(duty, float)
    assert duty < 0.35


def test_intermittent_notes_are_mixed() -> None:
    """One-second notes separated by one-second gaps land in the mixed band."""
    note = _sine(1.0)
    gap = np.zeros(SR, dtype=np.float32)
    audio = np.concatenate([note, gap, note, gap, note, gap]).astype(np.float32)
    result = analyze_articulation(audio, SR)
    duty = result["duty_cycle"]
    density = result["onset_density_per_s"]
    assert isinstance(duty, float)
    assert isinstance(density, float)
    # Documented "mixed" band: neither sustained (duty > 0.6 and density < 1.5)
    # nor choppy (density >= 3.0 or duty < 0.35).
    assert 0.35 <= duty <= 0.6
    assert density < 3.0
    assert result["character"] == "mixed"


def test_silent_audio_returns_safe_default() -> None:
    """All-zero audio returns the neutral safe default."""
    audio = np.zeros(SR, dtype=np.float32)
    assert analyze_articulation(audio, SR) == SAFE_DEFAULT


def test_empty_audio_returns_safe_default() -> None:
    """An empty array returns the neutral safe default."""
    audio = np.array([], dtype=np.float32)
    assert analyze_articulation(audio, SR) == SAFE_DEFAULT


def test_invalid_sample_rate_returns_safe_default() -> None:
    """A non-positive sample rate returns the neutral safe default."""
    assert analyze_articulation(_sine(1.0), 0) == SAFE_DEFAULT


def test_no_active_frames_returns_safe_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Zero active frames (degenerate framing) returns the safe default."""

    def _zero_rms(**_kwargs: Any) -> NDArray[np.float32]:
        return np.zeros((1, 10), dtype=np.float32)

    monkeypatch.setattr(articulation.librosa.feature, "rms", _zero_rms)
    assert analyze_articulation(_sine(1.0), SR) == SAFE_DEFAULT


def test_internal_failure_returns_safe_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """No exception escapes: analysis failures return the safe default."""

    def _boom(**_kwargs: Any) -> NDArray[np.float32]:
        raise RuntimeError("synthetic failure")

    monkeypatch.setattr(articulation.librosa.onset, "onset_strength", _boom)
    assert analyze_articulation(_sine(1.0), SR) == SAFE_DEFAULT


def test_empty_stems_dict_returns_empty() -> None:
    """An empty stems dict maps to an empty result dict."""
    assert analyze_stem_articulation({}, SR) == {}


def test_stem_mapping_covers_all_stems() -> None:
    """Every stem in the input dict is analyzed and keyed in the output."""
    stems = {
        "vocals": _sine(3.0),
        "bass": np.zeros(SR, dtype=np.float32),
    }
    results = analyze_stem_articulation(stems, SR)
    assert set(results) == {"vocals", "bass"}
    assert results["vocals"]["character"] == "sustained"
    assert results["bass"] == SAFE_DEFAULT
