"""Regression tests for CLI job-file authority boundaries."""

from __future__ import annotations

import builtins
import io
import json
import os

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


def test_cli_rejects_symlink_job_path_without_following_target(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """A ``--job`` symlink must not gain authority to its regular-file target."""
    target = tmp_path / "target.json"
    target.write_text('{"jobId":"job","request":{}}', encoding="utf-8")
    link = tmp_path / "job.json"
    try:
        link.symlink_to(target)
    except OSError as error:
        pytest.skip(f"symlinks unavailable in this environment: {error}")

    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(link)])
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == "Failed to read job file"


def test_cli_rejects_path_replacement_between_metadata_and_open(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """The opened descriptor must identify the same regular file that was preflighted."""
    original = tmp_path / "original.json"
    replacement = tmp_path / "replacement.json"
    original.write_text('{"jobId":"original","request":{}}', encoding="utf-8")
    replacement.write_text('{"jobId":"replacement","request":{}}', encoding="utf-8")
    original_os_open = os.open

    def substituted_open(path: str, flags: int, mode: int = 0o777) -> int:
        """Model a local path replacement by opening a different regular inode."""
        if path == str(original):
            return original_os_open(str(replacement), flags, mode)
        return original_os_open(path, flags, mode)

    stdout = io.StringIO()
    monkeypatch.setattr(cli.os, "open", substituted_open)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(original)])
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == "Failed to read job file"
