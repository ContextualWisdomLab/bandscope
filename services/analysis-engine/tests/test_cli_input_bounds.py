"""Regression tests for bounded analysis-engine CLI input reads."""

from __future__ import annotations

import io
import json

import pytest

from bandscope_analysis import cli


class _BoundedReadRequired(io.StringIO):
    """Fail when production attempts an unbounded stream read."""

    def read(self, size: int = -1) -> str:
        """Read only when the caller supplies an explicit nonnegative bound."""
        if size < 0:
            raise AssertionError("CLI stdin read must be explicitly bounded")
        return super().read(size)


class _OversizedInput:
    """Provide an oversized payload without retaining it in the fixture."""

    def read(self, size: int = -1) -> str:
        """Return exactly the requested amount so production observes overflow."""
        if size < 0:
            raise AssertionError("CLI stdin read must be explicitly bounded")
        return "x" * size


def test_cli_stdin_read_uses_explicit_size_bound(monkeypatch: pytest.MonkeyPatch) -> None:
    """A normal stdin job must never trigger an unbounded ``read()`` call."""
    payload = json.dumps(
        {
            "jobId": "bounded-stdin",
            "request": {
                "sourceKind": "demo",
                "sourceLabel": "Bounded Input",
                "roleFocus": ["bass-guitar"],
            },
        }
    )
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])
    monkeypatch.setattr(cli.sys, "stdin", _BoundedReadRequired(payload))
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 0
    assert json.loads(stdout.getvalue())["jobId"] == "bounded-stdin"


def test_cli_rejects_oversized_stdin_before_json_parsing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Oversized stdin is rejected after one bounded read, before JSON parsing."""
    stdout = io.StringIO()
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])
    monkeypatch.setattr(cli.sys, "stdin", _OversizedInput())
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["state"] == "failed"
    assert response["error"]["message"] == "Job input exceeds maximum size limit"


def test_cli_stdin_limit_is_measured_in_utf8_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Multibyte stdin must not bypass the advertised byte-size boundary."""
    stdout = io.StringIO()
    monkeypatch.setattr(cli, "MAX_JSON_FILE_SIZE", 8)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py"])
    monkeypatch.setattr(cli.sys, "stdin", _BoundedReadRequired("é" * 5))
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["error"]["message"] == "Job input exceeds maximum size limit"


def test_cli_inline_job_argument_obeys_input_byte_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An inline ``--job`` payload cannot bypass the common JSON byte limit."""
    stdout = io.StringIO()
    monkeypatch.setattr(cli, "MAX_JSON_FILE_SIZE", 8)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", '{"jobId":"é"}'])
    monkeypatch.setattr(cli.sys, "stdin", _BoundedReadRequired(""))
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["error"]["message"] == "Job input exceeds maximum size limit"


def test_cli_job_file_limit_is_measured_in_utf8_bytes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    """A multibyte job file is rejected by bytes even when character count is small."""
    job_file = tmp_path / "multibyte_job.json"
    job_file.write_text("é" * 5, encoding="utf-8")
    stdout = io.StringIO()
    monkeypatch.setattr(cli, "MAX_JSON_FILE_SIZE", 8)
    monkeypatch.setattr(cli.sys, "argv", ["cli.py", "--job", str(job_file)])
    monkeypatch.setattr(cli.sys, "stdin", _BoundedReadRequired(""))
    monkeypatch.setattr(cli.sys, "stdout", stdout)

    assert cli.main() == 1
    response = json.loads(stdout.getvalue())
    assert response["error"]["message"] == "Job file exceeds maximum size limit"
