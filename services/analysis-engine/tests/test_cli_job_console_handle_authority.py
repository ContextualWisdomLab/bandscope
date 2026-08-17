"""Console-handle and legacy-device classification for CLI job paths."""

from __future__ import annotations

import pytest

from bandscope_analysis import cli


def _forbid_filesystem(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail the test if lexical rejection happens after filesystem contact."""

    def forbidden_lstat(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("unsafe job path reached os.lstat")

    def forbidden_open(*_args: object, **_kwargs: object) -> int:
        raise AssertionError("unsafe job path reached os.open")

    monkeypatch.setattr(cli.os, "lstat", forbidden_lstat)
    monkeypatch.setattr(cli.os, "open", forbidden_open)


@pytest.mark.parametrize(
    "path",
    [
        r"C:job.json",
        r"D:..\job.json",
        "C:",
    ],
)
def test_drive_relative_jobs_fail_before_lstat_and_open(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    """Drive-relative jobs must not inherit per-drive current-directory authority."""
    _forbid_filesystem(monkeypatch)
    assert cli.classify_windows_job_path_authority(path) == cli.WINDOWS_JOB_PATH_DRIVE_RELATIVE
    with pytest.raises(OSError, match="local regular-file namespace"):
        cli._read_bounded_job_file(path)


@pytest.mark.parametrize(
    "path",
    [
        "CONIN$",
        "conin$",
        "CONIN$.txt",
        "CONOUT$",
        "CONOUT$:",
        r"parent\CONIN$",
    ],
)
def test_console_handles_are_not_naming_a_file_reserved_names(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    """CONIN$/CONOUT$ follow console-handles (2021-12-30), not naming-a-file."""
    _forbid_filesystem(monkeypatch)
    assert cli.classify_windows_job_path_authority(path) == cli.WINDOWS_JOB_PATH_CONSOLE_HANDLE
    assert cli.classify_windows_job_path_authority(path) != cli.WINDOWS_JOB_PATH_RESERVED_FILENAME
    with pytest.raises(OSError, match="local regular-file namespace"):
        cli._read_bounded_job_file(path)


@pytest.mark.parametrize("path", ["CLOCK$", "clock$", "CLOCK$.txt", r"jobs\CLOCK$"])
def test_clock_dollar_is_fail_closed_legacy_device(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    """CLOCK$ is not a current reserved filename; reject it as a legacy device."""
    _forbid_filesystem(monkeypatch)
    assert cli.classify_windows_job_path_authority(path) == cli.WINDOWS_JOB_PATH_LEGACY_DEVICE
    assert cli.classify_windows_job_path_authority(path) != cli.WINDOWS_JOB_PATH_RESERVED_FILENAME
    with pytest.raises(OSError, match="local regular-file namespace"):
        cli._read_bounded_job_file(path)


def test_con_remains_a_naming_a_file_reserved_filename(monkeypatch: pytest.MonkeyPatch) -> None:
    """CON stays on the naming-a-file reserved list and still fails before lookup."""
    _forbid_filesystem(monkeypatch)
    assert cli.classify_windows_job_path_authority("CON") == cli.WINDOWS_JOB_PATH_RESERVED_FILENAME
    with pytest.raises(OSError, match="local regular-file namespace"):
        cli._read_bounded_job_file("CON")
