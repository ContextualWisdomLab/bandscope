"""Integration regressions for pre-decode local-audio metadata admission."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from bandscope_analysis import audio_metadata
from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError
from bandscope_analysis.separation.audio_separator import AudioStemSeparator
from bandscope_analysis.temporal.analyzer import TemporalAnalyzer
from bandscope_analysis.transcription import api as transcription_api


def _overlong_metadata() -> SimpleNamespace:
    """Return metadata for a source one second beyond the 15-minute ceiling."""
    sampling_rate = 44_100
    return SimpleNamespace(
        samplerate=sampling_rate,
        channels=2,
        frames=sampling_rate * (15 * 60 + 1),
    )


def _install_overlong_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the real metadata preflight observe an overlong source header."""
    monkeypatch.setattr(audio_metadata.soundfile, "info", lambda _fileobj: _overlong_metadata())


def test_temporal_rejects_overlong_metadata_before_decode(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Temporal analysis must reject source duration before truncating decode to 15 minutes."""
    audio_path = tmp_path / "overlong.wav"
    audio_path.write_bytes(b"RIFF")
    _install_overlong_probe(monkeypatch)
    load_mock = Mock(side_effect=AssertionError("decoder must not run before admission"))
    monkeypatch.setattr("bandscope_analysis.temporal.analyzer.librosa.load", load_mock)

    with pytest.raises(AudioResourcePolicyError) as error:
        TemporalAnalyzer().analyze(audio_path)

    assert error.value.reason == "duration_exceeded"
    load_mock.assert_not_called()


def test_transcription_rejects_overlong_metadata_before_decode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bass transcription must reject source duration before resampling or truncation."""
    _install_overlong_probe(monkeypatch)
    load_mock = Mock(side_effect=AssertionError("decoder must not run before admission"))
    monkeypatch.setattr(transcription_api.librosa, "load", load_mock)

    with pytest.raises(AudioResourcePolicyError) as error:
        transcription_api.transcribe_bass_stem(b"RIFF")

    assert error.value.reason == "duration_exceeded"
    load_mock.assert_not_called()


def test_separation_rejects_overlong_metadata_before_decode(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Stem separation must reject source duration before mono/resample decode changes it."""
    audio_path = tmp_path / "overlong.wav"
    audio_path.write_bytes(b"RIFF")
    _install_overlong_probe(monkeypatch)
    load_mock = Mock(side_effect=AssertionError("decoder must not run before admission"))
    monkeypatch.setattr("bandscope_analysis.separation.audio_separator.librosa.load", load_mock)

    with pytest.raises(AudioResourcePolicyError) as error:
        AudioStemSeparator()._load_audio(audio_path)

    assert error.value.reason == "duration_exceeded"
    load_mock.assert_not_called()
