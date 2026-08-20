"""Privacy regressions for range-analysis safe-failure logging."""

from unittest.mock import patch

import librosa
import numpy as np
import pytest

from bandscope_analysis.ranges.pitch_tracker import PitchTracker
from bandscope_analysis.ranges.pressure import (
    analyze_range_pressure,
    analyze_range_pressure_from_audio,
)

_DEFAULT_PRESSURE = {
    "range_semitones": 0,
    "tessitura_center": "",
    "time_in_top_range": 0.0,
    "longest_high_sustain_seconds": 0.0,
    "pressure_level": "low",
}


def _assert_payload_safe_log(
    caplog: pytest.LogCaptureFixture,
    operation: str,
    filename: str,
) -> None:
    """Require the operation while rejecting path, file, and secret payloads."""
    assert operation in caplog.text
    assert "/Users/Alice" not in caplog.text
    assert filename not in caplog.text
    assert "super-secret" not in caplog.text


def test_pitch_tracker_parameter_error_log_is_payload_safe(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """pYIN parameter failures keep dependency payloads out of tracker logs."""
    tracker = PitchTracker()
    audio = np.ones(2048, dtype=np.float64)
    detail = "/Users/Alice/private-pitch.wav token=super-secret"

    with patch(
        "bandscope_analysis.ranges.pitch_tracker.librosa.pyin",
        side_effect=librosa.util.exceptions.ParameterError(detail),
    ):
        result = tracker.track(audio, sr=22050)

    assert result == {"lowest_note": None, "highest_note": None, "confidence": "low"}
    _assert_payload_safe_log(caplog, "pYIN failed", "private-pitch.wav")


def test_range_pressure_internal_failure_log_is_payload_safe(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Generic range-pressure failures retain no traceback or message payload."""
    detail = "/Users/Alice/private-pressure.wav token=super-secret"

    def _boom(*_args: object, **_kwargs: object) -> dict[str, object]:
        raise RuntimeError(detail)

    monkeypatch.setattr("bandscope_analysis.ranges.pressure._analyze", _boom)
    values = np.ones(1, dtype=np.float64)
    result = analyze_range_pressure(values, np.ones(1, dtype=bool), values)

    assert result == _DEFAULT_PRESSURE
    _assert_payload_safe_log(
        caplog,
        "Range-pressure analysis failed; returning default",
        "private-pressure.wav",
    )


def test_range_pressure_pyin_failure_log_is_payload_safe(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Audio-wrapper pYIN failures keep dependency payloads out of routine logs."""
    audio = np.ones(2048, dtype=np.float64)
    detail = "/Users/Alice/private-pressure-audio.wav token=super-secret"

    with patch(
        "bandscope_analysis.ranges.pressure.librosa.pyin",
        side_effect=librosa.util.exceptions.ParameterError(detail),
    ):
        result = analyze_range_pressure_from_audio(audio, sr=22050)

    assert result == _DEFAULT_PRESSURE
    _assert_payload_safe_log(
        caplog,
        "pYIN failed during range-pressure analysis",
        "private-pressure-audio.wav",
    )
