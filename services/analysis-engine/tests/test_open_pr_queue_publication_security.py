"""Security regression tests for open-PR queue publication."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_refresher() -> ModuleType:
    """Load the queue refresher without requiring scripts to be a package."""
    sys.path.insert(0, str(REFRESHER_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location("refresh_open_pr_queue", REFRESHER_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def test_atomic_publication_rejects_symlinked_parent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A repository symlink must not redirect the queue manifest outside the worktree."""
    refresher = _load_refresher()
    repository_root = tmp_path / "repo"
    docs_root = repository_root / "docs"
    docs_root.mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    publication_parent = docs_root / "product-readiness"
    publication_parent.symlink_to(outside, target_is_directory=True)
    manifest_path = publication_parent / "open-pr-queue.json"

    monkeypatch.setattr(refresher, "REPO_ROOT", repository_root)
    monkeypatch.setattr(refresher, "MANIFEST_PATH", manifest_path)

    with pytest.raises(refresher.RefreshError, match="parent.*symbolic link"):
        refresher._write_manifest_atomic({"schema_version": "security-regression"})

    assert not (outside / "open-pr-queue.json").exists()
