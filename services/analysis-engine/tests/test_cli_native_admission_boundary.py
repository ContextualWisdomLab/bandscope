"""CLI trust-boundary regressions for native-admitted local audio."""

from __future__ import annotations

import io
import json

import pytest

from bandscope_analysis import cli


def test_native_admission_skips_temporary_path_reopen(monkeypatch: pytest.MonkeyPatch) -> None:
    """Do not decode a mutable pathname before the content-bound worker path."""
    payload = {
        "jobId": "job-native-admitted",
        "request": {
            "sourceKind": "local_audio",
            "projectId": "project-1-1",
            "sourceLabel": "source.wav",
            "roleFocus": [],
            "localSource": {
                "sourcePath": "/native/app-owned/project-1-1/source.wav",
                "fileName": "source.wav",
                "extension": "wav",
                "fileSizeBytes": 12,
            },
        },
    }
    stdin = io.StringIO(json.dumps(payload))
    stdout = io.StringIO()

    class ForbiddenTemporalAnalyzer:
        def __init__(self) -> None:
            raise AssertionError("native-admitted audio must not be reopened by the CLI probe")

    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", "12")
    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", "0" * 64)
    monkeypatch.setattr(cli, "TemporalAnalyzer", ForbiddenTemporalAnalyzer)
    monkeypatch.setattr(
        cli,
        "run_analysis_job",
        lambda job_id, request, requested_at: {
            "jobId": job_id,
            "state": "succeeded",
            "requestedAt": requested_at,
            "updatedAt": requested_at,
        },
    )
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])

    assert cli.main() == 0
    assert json.loads(stdout.getvalue())["jobId"] == "job-native-admitted"
