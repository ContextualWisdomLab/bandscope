"""Regression tests for native ownership of analysis request timestamps."""

from __future__ import annotations

import io
import json
from typing import Any

import pytest

from bandscope_analysis import cli


def test_progress_jsonl_preserves_native_requested_at(monkeypatch: pytest.MonkeyPatch) -> None:
    """Require the helper to echo the native request timestamp without re-minting it."""
    requested_at = "2026-09-09T00:57:21Z"
    observed: dict[str, str] = {}
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-native-time",
                "requestedAt": requested_at,
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Native Clock Authority",
                    "roleFocus": [],
                },
            }
        )
    )
    stdout = io.StringIO()

    def fake_updates(
        job_id: str,
        request: object,
        helper_requested_at: str,
    ) -> list[dict[str, Any]]:
        del request
        observed["requested_at"] = helper_requested_at
        return [
            {
                "jobId": job_id,
                "state": "failed",
                "requestedAt": helper_requested_at,
                "updatedAt": helper_requested_at,
                "error": {
                    "code": "engine_unavailable",
                    "message": "fixture terminal status",
                },
            }
        ]

    monkeypatch.setattr(cli, "run_analysis_job_updates", fake_updates)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--progress-jsonl"])

    assert cli.main() == 0
    assert observed["requested_at"] == requested_at
    assert json.loads(stdout.getvalue())["requestedAt"] == requested_at


def test_progress_jsonl_delegates_local_audio_analysis_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep local-audio MIR work inside the orchestration owner instead of pre-running it in CLI."""
    requested_at = "2026-09-09T01:00:00Z"
    observed = {"temporal_calls": 0, "orchestration_calls": 0}
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-single-analysis-owner",
                "requestedAt": requested_at,
                "request": {
                    "sourceKind": "local_audio",
                    "projectId": "project-1-1",
                    "sourceLabel": "rehearsal.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/app-owned/project/source.wav",
                        "fileName": "rehearsal.wav",
                        "extension": "wav",
                        "fileSizeBytes": 1024,
                    },
                },
            }
        )
    )
    stdout = io.StringIO()

    class CountingTemporalAnalyzer:
        def __init__(self) -> None:
            observed["temporal_calls"] += 1

        def analyze(self, _audio_path: str) -> dict[str, float]:
            return {"bpm": 120.0}

    def fake_updates(
        job_id: str,
        request: object,
        helper_requested_at: str,
    ) -> list[dict[str, Any]]:
        del request
        observed["orchestration_calls"] += 1
        return [
            {
                "jobId": job_id,
                "state": "failed",
                "requestedAt": helper_requested_at,
                "updatedAt": helper_requested_at,
                "error": {
                    "code": "engine_unavailable",
                    "message": "fixture terminal status",
                },
            }
        ]

    monkeypatch.setattr(cli, "TemporalAnalyzer", CountingTemporalAnalyzer, raising=False)
    monkeypatch.setattr(cli, "run_analysis_job_updates", fake_updates)
    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--progress-jsonl"])

    assert cli.main() == 0
    assert observed["orchestration_calls"] == 1
    assert observed["temporal_calls"] == 0
