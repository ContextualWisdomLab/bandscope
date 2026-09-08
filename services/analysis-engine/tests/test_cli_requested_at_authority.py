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
