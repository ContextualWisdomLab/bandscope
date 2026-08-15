"""Regression tests for CLI job-file authority boundaries."""

from __future__ import annotations

import builtins
import io
import json

import pytest

from bandscope_analysis import cli


def test_cli_rejects_non_regular_job_path_before_open(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """A non-regular ``--job`` path must fail before any blocking file open."""
    stdout = io.StringIO()
    open_called = False
    original_open = builtins.open

    def tracking_open(*args: object, **kwargs: object):
        """Record an attempted open while preserving the underlying behavior."""
        nonlocal open_called
        open_called = True
        return original_open(*args, **kwargs)

    monkeypatch.setattr(builtins, "open", tracking_open)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(tmp_path)])
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    assert open_called is False
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == "Failed to read job file"
