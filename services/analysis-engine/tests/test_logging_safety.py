"""Logging safety regressions for untrusted analysis inputs."""

from __future__ import annotations

import io
import json
import logging
from pathlib import Path

import pytest

from bandscope_analysis import cli
from bandscope_analysis.temporal import TemporalAnalyzer
from bandscope_analysis.temporal import analyzer as analyzer_module

_LOG_CONTROL_ESCAPES = (
    ("\n", "\\n"),
    ("\r", "\\r"),
    ("\t", "\\t"),
    ("\x1b", "\\x1b"),
    ("\x00", "\\x00"),
)
_HOSTILE_LOG_VALUES = (
    "FORGED\nSECURITY EVENT",
    "FORGED\r\nSECURITY EVENT",
    "FORGED\tSECURITY EVENT",
    "FORGED\x1b[31mSECURITY EVENT",
    "FORGED\x00SECURITY EVENT",
    "정상-유니코드-é",
)


def _assert_log_value_is_single_record(rendered: str, untrusted_value: str) -> None:
    for control_character, escaped_form in _LOG_CONTROL_ESCAPES:
        assert control_character not in rendered
        if control_character in untrusted_value:
            assert escaped_form in rendered
    if untrusted_value == "정상-유니코드-é":
        assert untrusted_value in rendered


@pytest.mark.parametrize("untrusted_value", _HOSTILE_LOG_VALUES)
def test_temporal_error_log_escapes_exception_control_characters(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
    untrusted_value: str,
) -> None:
    """Decoder failures must not inject a second physical log line."""
    audio_path = tmp_path / "buyer-audio.wav"
    audio_path.write_bytes(b"not-a-real-wave")

    def fail_decode(*_args: object, **_kwargs: object) -> object:
        """Raise a decoder error carrying the parameterized untrusted value."""
        raise RuntimeError(untrusted_value)

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
    _assert_log_value_is_single_record(messages[0], untrusted_value)


def test_temporal_error_log_neutralizes_hostile_exception_repr(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A decoder exception cannot bypass log neutralization via custom repr."""
    audio_path = tmp_path / "buyer-audio.wav"
    audio_path.write_bytes(b"not-a-real-wave")

    class HostileDecoderError(RuntimeError):
        """Model a dependency exception whose repr emits raw control characters."""

        def __repr__(self) -> str:
            """Return an intentionally unsafe representation for the regression."""
            return "HostileDecoderError('FORGED\nSECURITY EVENT\x1b[31m')"

    def fail_decode(*_args: object, **_kwargs: object) -> object:
        """Raise the dependency-shaped exception through the real analyzer path."""
        raise HostileDecoderError("decoder failed")

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
    assert "\x1b" not in messages[0]
    assert "\\n" in messages[0]
    assert "\\x1b" in messages[0]


@pytest.mark.parametrize("untrusted_value", _HOSTILE_LOG_VALUES)
def test_cli_logs_untrusted_filename_as_single_line(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    untrusted_value: str,
) -> None:
    """Local-audio labels must stay on one physical log line on fallback."""
    malicious_name = f"buyer-{untrusted_value}.wav"
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "log-safety",
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "project-log-safety",
                    "sourceLabel": "buyer.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/synthetic/buyer.wav",
                        "fileName": malicious_name,
                        "extension": "wav",
                        "fileSizeBytes": 1,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class FailingAnalyzer:
        """Exercise the CLI fallback without touching a real decoder."""

        def analyze(self, _path: object) -> object:
            """Fail after the buyer-controlled file name has been logged."""
            raise RuntimeError("expected test failure")

    monkeypatch.setattr(cli, "TemporalAnalyzer", FailingAnalyzer)
    monkeypatch.setattr(
        cli,
        "run_analysis_job",
        lambda _job_id, _request, requested_at: {
            "jobId": "log-safety",
            "state": "failed",
            "requestedAt": requested_at,
            "updatedAt": requested_at,
        },
    )
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])
    caplog.set_level(logging.INFO)

    assert cli.main() == 0

    messages = [
        record.getMessage()
        for record in caplog.records
        if "buyer-" in record.getMessage()
    ]
    assert len(messages) == 2
    for message in messages:
        _assert_log_value_is_single_record(message, untrusted_value)
