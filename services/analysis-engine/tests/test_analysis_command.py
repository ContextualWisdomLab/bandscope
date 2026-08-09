"""Tests for the repository analysis-command launcher."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import load_module


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
