"""Regression tests for bounded pagination of live branch-tip inventory."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_refresher() -> ModuleType:
    """Load the queue refresher without making scripts a Python package."""
    sys.path.insert(0, str(REFRESHER_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location(
            "refresh_open_pr_queue_branch_pagination", REFRESHER_PATH
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _branch_ref(branch_ref: str, sha: str) -> dict[str, object]:
    """Return one matching-refs API branch record."""
    return {
        "ref": f"refs/heads/{branch_ref}",
        "object": {"type": "commit", "sha": sha},
    }


def test_branch_index_follows_matching_refs_pagination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A target branch present only after page one must still resolve exactly."""
    refresher = _load_refresher()
    observed: list[str] = []

    def fake_request(target: str, token: str | None) -> tuple[object, str]:
        observed.append(target)
        if target.endswith("?per_page=100&page=1"):
            return (
                [_branch_ref("develop", "d" * 40)],
                '<https://api.github.com/repositories/1178322014/git/matching-refs/heads/?per_page=100&page=2>; rel="next"',
            )
        if target.endswith("?per_page=100&page=2"):
            return (
                [_branch_ref("docs/gap-baseline-2026-08-31", "e" * 40)],
                "",
            )
        raise AssertionError(f"unexpected GitHub target: {target}")

    monkeypatch.setattr(refresher, "_request_github_json", fake_request)

    branch_index = refresher.fetch_live_branch_index(None)

    assert branch_index == {
        "develop": "d" * 40,
        "docs/gap-baseline-2026-08-31": "e" * 40,
    }
    assert observed == [
        "/repos/ContextualWisdomLab/bandscope/git/matching-refs/heads/?per_page=100&page=1",
        "/repos/ContextualWisdomLab/bandscope/git/matching-refs/heads/?per_page=100&page=2",
    ]
