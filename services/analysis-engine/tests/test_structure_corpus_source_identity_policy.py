"""Source-identity policy for real-audio MIR corpus admission."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from test_structure_corpus_admission import _admission


def _run_git(repo: Path, *args: str) -> None:
    """Run a local Git command for the isolated source-identity fixture."""
    subprocess.run(
        ["git", *args],
        cwd=repo,
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )


def test_runtime_identity_rejects_uncommitted_source_drift(tmp_path: Path) -> None:
    """Registered HEAD cannot identify an experiment executed from a dirty worktree."""
    admission = _admission()
    repo = tmp_path / "repo"
    repo.mkdir()
    _run_git(repo, "init")
    _run_git(repo, "config", "user.email", "bandscope-test@example.invalid")
    _run_git(repo, "config", "user.name", "BandScope Test")
    (repo / "uv.lock").write_text("lock-v1\n", encoding="utf-8")
    source = repo / "analysis.py"
    source.write_text("FEATURE = 'registered'\n", encoding="utf-8")
    _run_git(repo, "add", "uv.lock", "analysis.py")
    _run_git(repo, "commit", "-m", "fixture")

    source.write_text("FEATURE = 'uncommitted-drift'\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="working tree must be clean"):
        admission._current_runtime_identity(repo)
