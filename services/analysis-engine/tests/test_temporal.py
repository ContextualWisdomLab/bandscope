"""Tests for temporal analysis module."""

import logging
import warnings
from pathlib import Path
from typing import BinaryIO
from unittest.mock import Mock

import numpy as np
import pytest
import soundfile as sf  # type: ignore

from bandscope_analysis.temporal import TemporalAnalyzer
from bandscope_analysis.temporal.analyzer import _estimate_downbeats


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


@pytest.fixture
def private_audio_file(tmp_path: Path) -> Path:
    """Synthetic short WAV; both parent and basename carry private markers."""
    parent = tmp_path / "private-directory-marker"
    parent.mkdir()
    path = parent / "private-filename-marker.wav"
    sf.write(path, np.zeros(4410, dtype=float), 44100)
    return path


def test_temporal_analyzer_success_logs_keep_local_path_private(
    monkeypatch: pytest.MonkeyPatch,
    private_audio_file: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Run the real analyzer with deterministic synthetic decode/beat boundaries."""
    import librosa

    from bandscope_analysis.temporal import analyzer as analyzer_module

    decoded = np.zeros(4410, dtype=float)
    # Equality with the opened-file size is accepted; one-byte-over is tested below.
    monkeypatch.setattr(analyzer_module, "MAX_AUDIO_FILE_BYTES", private_audio_file.stat().st_size)
    load_calls = []

    def fake_load(fileobj: BinaryIO, **kwargs: object) -> tuple[np.ndarray, int]:
        assert not fileobj.closed
        assert fileobj.read(4) == b"RIFF"
        # The existing narrow filters still silence known third-party churn.
        warnings.warn_explicit(
            "pkg_resources is deprecated",
            DeprecationWarning,
            "synthetic_loader.py",
            1,
            module="librosa.synthetic",
        )
        warnings.warn_explicit(
            "Numba synthetic churn",
            FutureWarning,
            "synthetic_loader.py",
            1,
            module="numba.synthetic",
        )
        load_calls.append(kwargs)
        return decoded, 44100

    monkeypatch.setattr(librosa, "load", fake_load)
    monkeypatch.setattr(
        librosa.beat, "beat_track", lambda *, y, sr: (np.array([120.0]), np.arange(8))
    )
    monkeypatch.setattr(librosa, "frames_to_time", lambda frames, *, sr: np.arange(8) * 0.01)
    monkeypatch.setattr(
        librosa.onset, "onset_strength", lambda *, y, sr: np.array([1, 2, 8, 2, 1, 2, 8, 2])
    )
    with warnings.catch_warnings(record=True) as observed_warnings:
        warnings.simplefilter("always")
        with caplog.at_level(logging.INFO, logger=analyzer_module.__name__):
            features = TemporalAnalyzer().analyze(private_audio_file)
    assert observed_warnings == []

    assert features == {
        "bpm": 120.0,
        "beat_times": [float(i * 0.01) for i in range(8)],
        "downbeat_times": [0.02, 0.06],
        "duration_seconds": 0.1,
        "sample_rate": 44100,
        "audio_path": str(private_audio_file),
    }
    assert load_calls == [{"sr": 44100, "mono": True, "duration": 900}]
    records = [record for record in caplog.records if record.name == analyzer_module.__name__]
    assert records
    assert all(record.levelno == logging.INFO for record in records)
    assert "Loading and decoding selected audio" in caplog.text
    for marker in (str(private_audio_file), private_audio_file.name, "private-directory-marker"):
        assert marker not in caplog.text
    assert all(record.exc_info is None for record in records)


@pytest.mark.parametrize(
    "boundary,error_type",
    [
        ("decoder", OSError),
        ("decoder", RuntimeError),
        ("decoder", Exception),
        ("decoder", ValueError),
        ("open", OSError),
        ("stat", OSError),
    ],
    ids=[
        "decoder-oserror",
        "decoder-runtimeerror",
        "decoder-generic",
        "decoder-valueerror",
        "reader-open",
        "reader-fstat",
    ],
)
def test_temporal_analyzer_boundary_failure_keeps_details_private(
    monkeypatch: pytest.MonkeyPatch,
    private_audio_file: Path,
    caplog: pytest.LogCaptureFixture,
    boundary: str,
    error_type: type[Exception],
) -> None:
    """Real analyze must reject boundary failure, not echo file or exception data."""
    import traceback

    import librosa

    from bandscope_analysis.temporal import analyzer as analyzer_module

    raw_detail = f"private-exception-marker: {private_audio_file}; Audio file is too large"
    load_mock = Mock(side_effect=error_type(raw_detail))
    monkeypatch.setattr(librosa, "load", load_mock)
    if boundary == "open":
        monkeypatch.setattr(Path, "open", Mock(side_effect=error_type(raw_detail)))
    elif boundary == "stat":
        monkeypatch.setattr(analyzer_module.os, "fstat", Mock(side_effect=error_type(raw_detail)))

    with caplog.at_level(logging.INFO, logger=analyzer_module.__name__):
        with pytest.raises(ValueError) as rejected:
            TemporalAnalyzer().analyze(private_audio_file)

    assert str(rejected.value) == "Temporal analysis failed"
    assert rejected.value.__cause__ is None
    assert rejected.value.__suppress_context__ is True
    public_traceback = "".join(traceback.format_exception(rejected.value))
    records = [record for record in caplog.records if record.name == analyzer_module.__name__]
    errors = [record for record in records if record.levelno == logging.ERROR]
    assert [record.getMessage() for record in errors] == ["Failed to analyze selected audio"]
    for marker in (
        str(private_audio_file),
        private_audio_file.name,
        "private-directory-marker",
        "private-exception-marker",
    ):
        assert marker not in caplog.text
        assert marker not in str(rejected.value)
        assert marker not in public_traceback
    assert all(record.exc_info is None for record in records)
    assert "Analysis complete" not in caplog.text
    if boundary == "decoder":
        load_mock.assert_called_once()
    else:
        load_mock.assert_not_called()


def test_temporal_analyzer_real_synthetic_wav_keeps_logs_private(
    dummy_audio_file: Path,
    private_audio_file: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Installed libsndfile/librosa decode synthetic audio, not a model acceptance."""
    private_audio_file.write_bytes(dummy_audio_file.read_bytes())
    with caplog.at_level(logging.INFO):
        features = TemporalAnalyzer().analyze(private_audio_file)
    assert features["audio_path"] == str(private_audio_file)
    assert features["sample_rate"] == 44100
    assert features["duration_seconds"] == pytest.approx(5.0)
    assert features["bpm"] > 0
    assert isinstance(features["beat_times"], list)
    assert isinstance(features["downbeat_times"], list)
    assert "Analysis complete" in caplog.text
    for marker in (str(private_audio_file), private_audio_file.name, "private-directory-marker"):
        assert marker not in caplog.text


@pytest.mark.parametrize("kind", ["missing", "directory"])
def test_temporal_analyzer_missing_path_keeps_details_private(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    kind: str,
) -> None:
    """Missing files and directories fail before decode without echoing their names."""
    import librosa

    path = tmp_path / "private-directory-marker" / "private-filename-marker.wav"
    if kind == "directory":
        path.mkdir(parents=True)
    load_mock = Mock(side_effect=AssertionError("decoder must not run"))
    monkeypatch.setattr(librosa, "load", load_mock)
    with caplog.at_level(logging.INFO):
        with pytest.raises(FileNotFoundError) as rejected:
            TemporalAnalyzer().analyze(path)
    assert str(rejected.value) == "Audio file not found: selected audio"
    assert rejected.value.__cause__ is None
    for marker in (str(path), path.name, "private-directory-marker"):
        assert marker not in str(rejected.value)
        assert marker not in caplog.text
    assert "Analysis complete" not in caplog.text
    load_mock.assert_not_called()


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


def test_temporal_analyzer_invalid_y_type(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Ensure temporal analyzer raises ValueError if librosa returns non-ndarray."""
    import librosa

    from bandscope_analysis.temporal.analyzer import TemporalAnalyzer

    def fake_load(*args, **kwargs):
        return "not-an-array", 22050

    monkeypatch.setattr(librosa, "load", fake_load)

    test_wav = tmp_path / "test.wav"
    test_wav.write_bytes(b"dummy")

    with pytest.raises(ValueError, match="^Temporal analysis failed$") as rejected:
        TemporalAnalyzer().analyze(test_wav)
    assert rejected.value.__cause__ is None
    assert rejected.value.__suppress_context__ is True


def test_temporal_analyzer_exception_handling(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Ensure temporal analyzer catches general exceptions and raises ValueError."""
    import librosa

    from bandscope_analysis.temporal.analyzer import TemporalAnalyzer

    def fake_load(*args: object, **kwargs: object) -> tuple[np.ndarray, int]:
        raise Exception("Mocked general error")

    monkeypatch.setattr(librosa, "load", fake_load)

    test_wav = tmp_path / "test.wav"
    test_wav.write_bytes(b"dummy")

    with pytest.raises(ValueError, match="^Temporal analysis failed$") as rejected:
        TemporalAnalyzer().analyze(test_wav)
    assert rejected.value.__cause__ is None
    assert rejected.value.__suppress_context__ is True


def test_temporal_analyzer_rejects_oversized_file(
    monkeypatch: pytest.MonkeyPatch,
    private_audio_file: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Reject on opened-file size before decoding, with a fixed distinct error."""
    import librosa

    from bandscope_analysis.temporal import analyzer as analyzer_module

    monkeypatch.setattr(
        analyzer_module, "MAX_AUDIO_FILE_BYTES", private_audio_file.stat().st_size - 1
    )
    load_mock = Mock(side_effect=AssertionError("decoder must not run for oversized files"))
    monkeypatch.setattr(librosa, "load", load_mock)

    with caplog.at_level(logging.INFO, logger=analyzer_module.__name__):
        with pytest.raises(ValueError) as rejected:
            TemporalAnalyzer().analyze(private_audio_file)
    assert str(rejected.value) == "Audio file is too large for temporal analysis"
    assert rejected.value.__cause__ is None
    assert rejected.value.__suppress_context__ is True
    assert "Failed to analyze selected audio" in caplog.text
    assert "Analysis complete" not in caplog.text
    for marker in (str(private_audio_file), private_audio_file.name, "private-directory-marker"):
        assert marker not in caplog.text
        assert marker not in str(rejected.value)
    load_mock.assert_not_called()


def test_temporal_analyzer_uses_duration_limit(monkeypatch, tmp_path: Path) -> None:
    """Ensure librosa.load receives bounded duration for safer decode behavior."""
    import librosa

    test_wav = tmp_path / "bounded.wav"
    test_wav.write_bytes(b"1234")
    captured_kwargs: dict[str, object] = {}

    def fake_load(path, **kwargs):
        captured_kwargs.update(kwargs)
        return np.zeros(44100, dtype=float), 44100

    monkeypatch.setattr(librosa, "load", fake_load)

    def fake_beat_track(y, sr):
        return np.array([120.0]), np.array([0])

    monkeypatch.setattr(librosa.beat, "beat_track", fake_beat_track)
    monkeypatch.setattr(librosa, "frames_to_time", lambda frames, sr: np.array([0.0]))

    analyzer = TemporalAnalyzer()
    analyzer.analyze(test_wav)

    from bandscope_analysis.temporal.analyzer import MAX_ANALYSIS_DURATION_SECONDS

    assert captured_kwargs["duration"] == MAX_ANALYSIS_DURATION_SECONDS


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


def test_estimate_downbeats_picks_strongest_onset_phase() -> None:
    """Downbeats land on the bar phase with the most onset energy, not index 0."""
    onset = np.full(200, 1.0)
    beat_frames = np.arange(16) * 10
    beat_times = beat_frames * 0.1
    # Accent phase 2 (beats 2, 6, 10, 14) — the old "every 4th from 0" would miss this.
    for i in range(2, 16, 4):
        onset[beat_frames[i]] = 10.0
    downbeats = _estimate_downbeats(onset, beat_frames, beat_times)
    assert downbeats == [float(beat_times[i]) for i in range(2, 16, 4)]


def test_estimate_downbeats_empty() -> None:
    """No beats yields no downbeats."""
    empty = np.array([])
    assert _estimate_downbeats(empty, empty, empty) == []


def test_estimate_downbeats_too_few_beats_returns_first() -> None:
    """Fewer beats than a bar falls back to the first beat as the downbeat."""
    onset = np.ones(50)
    assert _estimate_downbeats(onset, np.array([0, 10]), np.array([0.0, 0.5])) == [0.0]
