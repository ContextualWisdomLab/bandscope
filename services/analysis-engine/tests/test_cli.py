"""Tests for the analysis-engine orchestration CLI."""

from __future__ import annotations

import io
import json
import os
import runpy
import subprocess
import sys
from pathlib import Path

from bandscope_analysis import cli


def run_cli(payload: object) -> dict[str, object]:
    """Run the analysis CLI with a JSON payload and return its JSON response."""
    repo_root = Path(__file__).resolve().parents[3]
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "bandscope_analysis.cli",
        ],
        cwd=repo_root / "services" / "analysis-engine",
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
        env={
            **os.environ,
            "PYTHONPATH": str(repo_root / "services" / "analysis-engine" / "src"),
        },
    )
    return json.loads(completed.stdout)


def test_cli_returns_succeeded_job_status_for_valid_request() -> None:
    """Ensure the CLI returns a structured succeeded status for a valid request."""
    payload = {
        "jobId": "job-1",
        "request": {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar", "lead-vocal"],
        },
    }

    response = run_cli(payload)

    assert response["jobId"] == "job-1"
    assert response["state"] == "succeeded"
    assert response["result"]["title"] == "Late Night Set"


def test_cli_returns_failed_status_for_invalid_request() -> None:
    """Ensure the CLI returns a typed invalid-request failure for malformed payloads."""
    response = run_cli({"jobId": "job-2", "request": {"sourceKind": "demo"}})

    assert response["jobId"] == "job-2"
    assert response["state"] == "failed"
    assert response["error"] == {
        "code": "invalid_request",
        "message": "Invalid analysis job request: invalid field 'sourceLabel'",
    }


def test_cli_main_reads_stdin_and_writes_stdout(monkeypatch) -> None:
    """Ensure the CLI entrypoint can be exercised in-process for coverage."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-3",
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["keys-right"],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    assert json.loads(stdout.getvalue())["jobId"] == "job-3"


def test_cli_main_handles_non_mapping_payload(monkeypatch) -> None:
    """Ensure the CLI handles non-dict payloads without crashing."""
    stdin = io.StringIO(json.dumps(["demo"]))
    stdout = io.StringIO()

    monkeypatch.setattr(cli.sys, "stdin", stdin)
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    response = json.loads(stdout.getvalue())
    assert response["jobId"] == "unknown-job"
    assert response["state"] == "failed"


def test_cli_module_runs_as_main(monkeypatch) -> None:
    """Ensure the module-level main guard is covered by executing the module directly."""
    stdin = io.StringIO(
        json.dumps(
            {
                "jobId": "job-4",
                "request": {
                    "sourceKind": "demo",
                    "sourceLabel": "Late Night Set",
                    "roleFocus": ["bass-guitar"],
                },
            }
        )
    )
    stdout = io.StringIO()

    monkeypatch.setattr(sys, "stdin", stdin)
    monkeypatch.setattr(sys, "stdout", stdout)

    try:
        runpy.run_module("bandscope_analysis.cli", run_name="__main__")
    except SystemExit as exit_signal:
        assert exit_signal.code == 0

    assert json.loads(stdout.getvalue())["jobId"] == "job-4"
