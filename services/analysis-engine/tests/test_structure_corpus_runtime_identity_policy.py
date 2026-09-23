"""Runtime identity policy for real-audio corpus admission."""

from __future__ import annotations

import subprocess
from pathlib import Path
from types import ModuleType

import pytest
from conftest import load_module


def _admission() -> ModuleType:
    return load_module(
        "scripts/research/verify_structure_corpus.py",
        "verify_structure_corpus_runtime_identity",
    )


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


def test_runtime_digest_identity_is_hex_case_insensitive() -> None:
    """Validator-accepted uppercase hex must match lowercase runtime evidence."""
    admission = _admission()
    registration = {
        "runtime": {
            "source_commit": "A" * 40,
            "uv_lock_sha256": "B" * 64,
            "python_version": "3.12.11",
            "librosa_version": "0.11.0",
            "numpy_version": "2.3.3",
        }
    }
    runtime_identity = {
        "source_commit": "a" * 40,
        "uv_lock_sha256": "b" * 64,
        "python_version": "3.12.11",
        "librosa_version": "0.11.0",
        "numpy_version": "2.3.3",
    }

    normalized = admission._validate_runtime_identity(registration, runtime_identity)

    assert normalized["source_commit"] == "a" * 40
    assert normalized["uv_lock_sha256"] == "b" * 64


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
