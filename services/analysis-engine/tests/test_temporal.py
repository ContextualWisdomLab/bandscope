"""Tests for temporal analysis module."""

import warnings
from pathlib import Path
from unittest.mock import Mock

import numpy as np
import pytest
import soundfile as sf  # type: ignore

from bandscope_analysis.temporal import TemporalAnalyzer


@pytest.fixture
def dummy_audio_file(tmp_path: Path) -> Path:
    """Create a short dummy audio file (sine wave with a clear beat)."""
    sr = 44100
    duration = 5.0  # 5 seconds to give beat tracker enough data
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # 440 Hz sine wave + some volume modulation for "beats"
    # A clear 120 BPM transient
    audio = np.zeros_like(t)
    beat_interval = int(sr * 60 / 120)  # 0.5s intervals
    for i in range(0, len(audio), beat_interval):
        end = min(i + int(sr * 0.1), len(audio))
        audio[i:end] = np.sin(2 * np.pi * 100 * t[i:end])  # Drum-like thud

    file_path = tmp_path / "test_audio.wav"
    sf.write(str(file_path), audio, sr)
    return file_path


def test_temporal_analyzer_basic(dummy_audio_file: Path) -> None:
    """Test that the analyzer can decode audio and return valid features."""
    analyzer = TemporalAnalyzer()
    features = analyzer.analyze(dummy_audio_file)

    assert features["sample_rate"] == 44100
    assert features["duration_seconds"] == pytest.approx(5.0, abs=0.1)
    # librosa might not get exactly 120 with short synth data, but should be > 0
    assert features["bpm"] > 0
    assert isinstance(features["beat_times"], list)
    assert isinstance(features["downbeat_times"], list)


def test_temporal_analyzer_file_not_found() -> None:
    """Test that analyzer raises appropriate error for missing files."""
    analyzer = TemporalAnalyzer()
    with pytest.raises(FileNotFoundError, match="Audio file not found"):
        analyzer.analyze("nonexistent_file.wav")


def test_temporal_analyzer_missing_file_does_not_call_decoder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Missing paths should fail before librosa tries fallback decoders."""
    import librosa

    load_mock = Mock(side_effect=AssertionError("librosa.load should not be called"))
    monkeypatch.setattr(librosa, "load", load_mock)

    analyzer = TemporalAnalyzer()
    with pytest.raises(FileNotFoundError, match="Audio file not found"):
        analyzer.analyze("nonexistent_file.wav")
    load_mock.assert_not_called()


def test_temporal_analyzer_directory_does_not_call_decoder(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Directory paths should fail before librosa tries fallback decoders."""
    import librosa

    load_mock = Mock(side_effect=AssertionError("librosa.load should not be called"))
    monkeypatch.setattr(librosa, "load", load_mock)

    with pytest.raises(FileNotFoundError, match="Audio file not found"):
        TemporalAnalyzer().analyze(tmp_path)
    load_mock.assert_not_called()


def test_temporal_analyzer_large_file_does_not_call_decoder(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Oversized audio should fail before full-file decoding can allocate memory."""
    import librosa

    test_wav = tmp_path / "large.wav"
    with test_wav.open("wb") as handle:
        handle.truncate(50 * 1024 * 1024 + 1)

    load_mock = Mock(side_effect=AssertionError("librosa.load should not be called"))
    monkeypatch.setattr(librosa, "load", load_mock)

    with pytest.raises(ValueError, match="50MB analysis limit"):
        TemporalAnalyzer().analyze(test_wav)
    load_mock.assert_not_called()


def test_temporal_analyzer_invalid_y_type(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Ensure temporal analyzer raises ValueError if librosa returns non-ndarray."""
    import librosa

    from bandscope_analysis.temporal.analyzer import TemporalAnalyzer

    def fake_load(*args, **kwargs):
        return "not-an-array", 22050

    monkeypatch.setattr(librosa, "load", fake_load)

    test_wav = tmp_path / "test.wav"
    test_wav.write_bytes(b"dummy")

    with pytest.raises(ValueError, match="Expected numpy array"):
        TemporalAnalyzer().analyze(test_wav)


def test_temporal_analyzer_does_not_suppress_unrelated_loader_warnings(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Unrelated decoder warnings should remain visible to tests and callers."""
    import librosa

    test_wav = tmp_path / "test.wav"
    test_wav.write_bytes(b"dummy")

    def fake_load(*args: object, **kwargs: object) -> tuple[np.ndarray, int]:
        warnings.warn("unrelated downstream warning", FutureWarning, stacklevel=2)
        return np.zeros(1024, dtype=float), 44100

    monkeypatch.setattr(librosa, "load", fake_load)
    monkeypatch.setattr(librosa, "get_duration", lambda *, y, sr: 1.0)
    monkeypatch.setattr(
        librosa.beat,
        "beat_track",
        lambda *, y, sr: (np.array([120.0]), np.array([0, 1, 2, 3])),
    )
    monkeypatch.setattr(
        librosa,
        "frames_to_time",
        lambda frames, *, sr: np.array([0.0, 0.5, 1.0, 1.5]),
    )

    with pytest.warns(FutureWarning, match="unrelated downstream warning"):
        features = TemporalAnalyzer().analyze(test_wav)

    assert features["bpm"] == 120.0
