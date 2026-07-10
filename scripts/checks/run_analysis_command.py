"""Run analysis-engine checks without relying on a platform shell."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ANALYSIS_ENGINE_DIR = REPO_ROOT / "services" / "analysis-engine"


def _fallback_python() -> str:
    """Return the local analysis virtualenv interpreter when available."""
    if sys.platform == "win32":
        candidate = ANALYSIS_ENGINE_DIR / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = ANALYSIS_ENGINE_DIR / ".venv" / "bin" / "python"
    if candidate.exists():
        return str(candidate)
    return sys.executable


def _analysis_command(argv: list[str]) -> list[str]:
    """Return a uv command, or a local Python module fallback when uv is absent."""
    if shutil.which("uv"):
        return ["uv", "run", *argv]
    return [_fallback_python(), "-m", *argv]


def _normalize_args(argv: list[str]) -> list[str]:
    """Remove npm-forwarded flags that are already represented for Python tools."""
    if argv[0] == "pytest" and "--coverage" in argv:
        print(
            "Ignoring forwarded npm --coverage flag for pytest; "
            "Python coverage is configured with --cov."
        )
        return [arg for arg in argv if arg != "--coverage"]
    return argv


def main(argv: list[str]) -> int:
    """Run a uv-backed command from the analysis-engine package directory."""
    if not argv:
        print("No analysis command was provided.", file=sys.stderr)
        return 2

    argv = _normalize_args(argv)
    command = _analysis_command(argv)
    print(f"Running analysis command in {ANALYSIS_ENGINE_DIR}: {subprocess.list2cmdline(command)}")
    try:
        completed = subprocess.run(command, cwd=ANALYSIS_ENGINE_DIR, check=False)
    except FileNotFoundError as exc:
        print(f"Unable to start analysis command: {exc}", file=sys.stderr)
        return 127

    if completed.returncode != 0:
        print(
            f"Analysis command failed with exit code {completed.returncode}: "
            f"{subprocess.list2cmdline(command)}",
            file=sys.stderr,
        )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
