"""Tests for the repository analysis-command launcher."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import load_module


def test_analysis_command_runs_script_with_local_analysis_python(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Use the analysis virtualenv directly for repository Python scripts."""
    runner = load_module(
        "scripts/checks/run_analysis_command.py",
        "run_analysis_command_local_python_script",
    )
    monkeypatch.setattr(runner, "_fallback_python", lambda: "/analysis/python")
    monkeypatch.setattr(runner.sys, "executable", "/system/python")
    monkeypatch.setattr(runner.shutil, "which", lambda _name: "/usr/bin/uv")

    assert runner._analysis_command(["python", "../../scripts/check.py"]) == [
        "/analysis/python",
        "../../scripts/check.py",
    ]


def test_analysis_command_uses_uv_for_python_script_without_local_venv(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Let uv resolve the project environment when no separate interpreter exists."""
    runner = load_module(
        "scripts/checks/run_analysis_command.py",
        "run_analysis_command_uv_python_script",
    )
    monkeypatch.setattr(runner, "_fallback_python", lambda: runner.sys.executable)
    monkeypatch.setattr(runner.shutil, "which", lambda _name: "/usr/bin/uv")

    assert runner._analysis_command(["python", "../../scripts/check.py"]) == [
        "uv",
        "run",
        "python",
        "../../scripts/check.py",
    ]


def test_analysis_command_runs_python_script_without_uv(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Avoid treating the literal ``python`` launcher as a module name."""
    runner = load_module(
        "scripts/checks/run_analysis_command.py",
        "run_analysis_command_fallback_python_script",
    )
    monkeypatch.setattr(runner, "_fallback_python", lambda: runner.sys.executable)
    monkeypatch.setattr(runner.shutil, "which", lambda _name: None)

    assert runner._analysis_command(["python", "../../scripts/check.py"]) == [
        runner.sys.executable,
        "../../scripts/check.py",
    ]


def test_analysis_command_isolates_ambient_numba_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Keep native JIT cache files out of a shared or prebuilt virtualenv."""
    runner = load_module(
        "scripts/checks/run_analysis_command.py",
        "run_analysis_command_isolated_numba_cache",
    )
    captured_cache: list[Path] = []
    monkeypatch.delenv("NUMBA_CACHE_DIR", raising=False)
    monkeypatch.setattr(runner, "_analysis_command", lambda _argv: ["pytest"])

    def fake_run(
        command: list[str],
        *,
        cwd: Path,
        check: bool,
        env: dict[str, str],
    ) -> SimpleNamespace:
        del command, cwd, check
        cache_path = Path(env["NUMBA_CACHE_DIR"])
        assert cache_path.is_dir()
        captured_cache.append(cache_path)
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)

    assert runner.main(["pytest"]) == 0
    assert len(captured_cache) == 1
    assert not captured_cache[0].exists()


def test_analysis_command_preserves_explicit_numba_cache(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Honor an operator-provided cache when isolation is intentionally overridden."""
    runner = load_module(
        "scripts/checks/run_analysis_command.py",
        "run_analysis_command_explicit_numba_cache",
    )
    monkeypatch.setenv("NUMBA_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(runner, "_analysis_command", lambda _argv: ["pytest"])

    def fake_run(
        command: list[str],
        *,
        cwd: Path,
        check: bool,
        env: dict[str, str],
    ) -> SimpleNamespace:
        del command, cwd, check
        assert env["NUMBA_CACHE_DIR"] == str(tmp_path)
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(runner.subprocess, "run", fake_run)

    assert runner.main(["pytest"]) == 0
