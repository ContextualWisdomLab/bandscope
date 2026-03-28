"""Tests for temporal analysis module."""

import numpy as np
import pytest
import soundfile as sf
from pathlib import Path

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
    with pytest.raises(ValueError, match="Temporal analysis failed"):
        analyzer.analyze("nonexistent_file.wav")
