"""Logging safety regressions for untrusted analysis inputs."""

from __future__ import annotations

import logging
from pathlib import Path

import pytest

from bandscope_analysis.temporal import TemporalAnalyzer
from bandscope_analysis.temporal import analyzer as analyzer_module


def test_temporal_error_log_escapes_exception_control_characters(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Decoder failures must not inject a second physical log line."""
    audio_path = tmp_path / "buyer-audio.wav"
    audio_path.write_bytes(b"not-a-real-wave")

    def fail_decode(*_args: object, **_kwargs: object) -> object:
        """Raise a decoder error containing an injected physical newline."""
        raise RuntimeError("decoder failed\nFORGED SECURITY EVENT")

    monkeypatch.setattr(analyzer_module.librosa, "load", fail_decode)
    caplog.set_level(logging.ERROR, logger=analyzer_module.__name__)

    with pytest.raises(ValueError, match="Temporal analysis failed"):
        TemporalAnalyzer().analyze(audio_path)

    messages = [
        record.getMessage()
        for record in caplog.records
        if record.name == analyzer_module.__name__ and record.levelno >= logging.ERROR
    ]
    assert len(messages) == 1
    assert "\n" not in messages[0]
    assert "\\n" in messages[0]
