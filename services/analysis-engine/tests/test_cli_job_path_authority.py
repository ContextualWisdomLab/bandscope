"""Regression tests for CLI job-file local-path authority."""

from __future__ import annotations

import pytest

from bandscope_analysis import cli


@pytest.mark.parametrize(
    "path",
    [
        r"\\server\share\job.json",
        "//server/share/job.json",
        r"\\?\UNC\server\share\job.json",
        r"\\.\pipe\bandscope-job",
    ],
)
def test_remote_or_device_job_paths_fail_before_filesystem_lookup(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    """UNC/device namespace input must not reach metadata or open system calls."""

    def forbidden_lstat(_path: str) -> object:
        """Fail if lexical rejection happens after a filesystem lookup."""
        raise AssertionError("unsafe job path reached os.lstat")

    monkeypatch.setattr(cli.os, "lstat", forbidden_lstat)

    with pytest.raises(OSError):
        cli._read_bounded_job_file(path)
