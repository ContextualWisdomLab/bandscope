"""Tests for the repository analysis-command launcher."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import load_module


def test_root_check_launchers_use_cross_platform_python() -> None:
    """Keep npm and quickcheck entry points reachable across Python installations."""
    repo_root = Path(__file__).resolve().parents[3]
    package = json.loads((repo_root / "package.json").read_text(encoding="utf-8"))
    python_scripts = (
        "check:docs",
        "check:security-notes",
        "check:security-gates",
        "check:supply-chain",
        "check:github-bootstrap",
        "check:python-docstrings",
        "ruff:check",
        "ruff:format:check",
        "bandit:check",
        "typecheck",
    )

    launcher = "node scripts/checks/run_python.mjs"
    assert all(launcher in package["scripts"][name] for name in python_scripts)
    quickcheck = (repo_root / "scripts/harness/quickcheck.sh").read_text(encoding="utf-8")
    assert quickcheck.count(launcher) == 5


def test_python_launcher_declares_platform_specific_candidate_order() -> None:
    """Prefer standard launchers in a deterministic Windows and POSIX order."""
    repo_root = Path(__file__).resolve().parents[3]
    launcher_module = (repo_root / "scripts/checks/python_launcher.mjs").as_uri()
    node = shutil.which("node")
    assert node is not None
    expression = (
        f'import {{ pythonCandidates }} from "{launcher_module}"; '
        "console.log(JSON.stringify({"
        'win32: pythonCandidates("win32"), '
        'linux: pythonCandidates("linux")'
        "}));"
    )

    completed = subprocess.run(
        [node, "--input-type=module", "--eval", expression],
        check=True,
        capture_output=True,
        text=True,
    )

    assert json.loads(completed.stdout) == {
        "win32": [["py", ["-3"]], ["python", []], ["python3", []]],
        "linux": [["python3", []], ["python", []]],
    }


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable fixtures are required")
def test_python_launcher_executes_py_dash_three_for_windows_policy(tmp_path: Path) -> None:
    """Exercise the Windows candidate prefix without requiring a Windows host."""
    repo_root = Path(__file__).resolve().parents[3]
    launcher_module = (repo_root / "scripts/checks/python_launcher.mjs").as_uri()
    node = shutil.which("node")
    assert node is not None
    py_launcher = tmp_path / "py"
    py_launcher.write_text(
        '#!/bin/sh\n[ "$1" = "-3" ] || exit 9\nexit 0\n',
        encoding="utf-8",
    )
    py_launcher.chmod(0o700)
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)
    expression = (
        f'import {{ runPython }} from "{launcher_module}"; '
        'process.exitCode = runPython(["ignored.py"], '
        '{ platform: "win32", env: process.env });'
    )

    completed = subprocess.run(
        [node, "--input-type=module", "--eval", expression],
        cwd=repo_root,
        env=environment,
        check=False,
    )

    assert completed.returncode == 0


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable fixtures are required")
def test_python_launcher_uses_python3_only_posix_path(tmp_path: Path) -> None:
    """Run successfully where POSIX exposes python3 but no python alias."""
    repo_root = Path(__file__).resolve().parents[3]
    node = shutil.which("node")
    assert node is not None
    python3 = tmp_path / "python3"
    python3.symlink_to(Path(os.sys.executable))
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)

    completed = subprocess.run(
        [
            node,
            str(repo_root / "scripts/checks/run_python.mjs"),
            "-c",
            "print('python-launcher-ok')",
        ],
        cwd=repo_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    assert completed.stdout.strip() == "python-launcher-ok"


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable fixtures are required")
def test_python_launcher_falls_back_when_first_candidate_is_missing(tmp_path: Path) -> None:
    """Use the next candidate only when the preferred executable is absent."""
    repo_root = Path(__file__).resolve().parents[3]
    node = shutil.which("node")
    assert node is not None
    python = tmp_path / "python"
    python.symlink_to(Path(os.sys.executable))
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)

    completed = subprocess.run(
        [
            node,
            str(repo_root / "scripts/checks/run_python.mjs"),
            "-c",
            "print('fallback-ok')",
        ],
        cwd=repo_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    assert completed.stdout.strip() == "fallback-ok"


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable fixtures are required")
def test_python_launcher_does_not_mask_unlaunchable_candidate(tmp_path: Path) -> None:
    """Treat a non-ENOENT spawn error as authoritative instead of falling through."""
    repo_root = Path(__file__).resolve().parents[3]
    node = shutil.which("node")
    assert node is not None
    preferred = tmp_path / "python3"
    preferred.write_text("not executable\n", encoding="utf-8")
    preferred.chmod(0o600)
    fallback_marker = tmp_path / "fallback-ran"
    fallback = tmp_path / "python"
    fallback.write_text('#!/bin/sh\nprintf ran > "$FALLBACK_MARKER"\n', encoding="utf-8")
    fallback.chmod(0o700)
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)
    environment["FALLBACK_MARKER"] = str(fallback_marker)

    completed = subprocess.run(
        [node, str(repo_root / "scripts/checks/run_python.mjs"), "ignored.py"],
        cwd=repo_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 127
    assert "Unable to start python3" in completed.stderr
    assert not fallback_marker.exists()


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable fixtures are required")
def test_python_launcher_does_not_mask_candidate_failure(tmp_path: Path) -> None:
    """Return the first available interpreter's failure without trying another."""
    repo_root = Path(__file__).resolve().parents[3]
    node = shutil.which("node")
    assert node is not None
    for name, exit_code in (("python3", 7), ("python", 0)):
        candidate = tmp_path / name
        candidate.write_text(f"#!/bin/sh\nexit {exit_code}\n", encoding="utf-8")
        candidate.chmod(0o700)
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)

    completed = subprocess.run(
        [node, str(repo_root / "scripts/checks/run_python.mjs"), "ignored.py"],
        cwd=repo_root,
        env=environment,
        check=False,
    )

    assert completed.returncode == 7


@pytest.mark.skipif(os.name == "nt", reason="POSIX PATH semantics are required")
def test_python_launcher_reports_missing_interpreter(tmp_path: Path) -> None:
    """Return 127 instead of silently succeeding when no candidate exists."""
    repo_root = Path(__file__).resolve().parents[3]
    node = shutil.which("node")
    assert node is not None
    environment = os.environ.copy()
    environment["PATH"] = str(tmp_path)

    completed = subprocess.run(
        [node, str(repo_root / "scripts/checks/run_python.mjs"), "ignored.py"],
        cwd=repo_root,
        env=environment,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 127
    assert "Unable to find a Python interpreter" in completed.stderr


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
