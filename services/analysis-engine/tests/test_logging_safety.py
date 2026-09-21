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


def test_cli_logs_untrusted_filename_as_single_line(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Local-audio labels must stay on one physical log line on fallback."""
    malicious_name = "buyer.wav\nFORGED SECURITY EVENT"
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
        if "buyer.wav" in record.getMessage()
    ]
    assert len(messages) == 2
    assert all("\n" not in message for message in messages)
    assert all("\\n" in message for message in messages)
