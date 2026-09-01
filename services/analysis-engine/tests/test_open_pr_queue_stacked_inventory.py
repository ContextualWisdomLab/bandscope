"""Regression tests for complete open-PR inventory across stacked base branches."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
VERIFIER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_open_pr_queue.py"
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_module(path: Path, module_name: str) -> ModuleType:
    """Load one queue script without requiring scripts to be a Python package."""
    sys.path.insert(0, str(path.parent))
    try:
        spec = importlib.util.spec_from_file_location(module_name, path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _seed() -> dict[str, Any]:
    """Return a minimal valid queue seed before a complete live refresh."""
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-09-01",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "d" * 40,
        "open_pr_count": 1,
        "authority_note": "Refresh exact live evidence before action.",
        "trains": {
            "T8": {
                "description": "Live additions awaiting explicit merge-train triage",
                "issue": 966,
            }
        },
        "pull_requests": [
            {
                "number": 1116,
                "title": "canonical baseline",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/1116",
                "initial_train": "T8",
                "initial_disposition": "triage_required",
                "head_sha": "1" * 40,
                "head_sha_status": "exact_current_head",
                "predecessor_prs": [],
                "overlap_prs": [],
                "successor_pr": None,
            }
        ],
    }


def _live_pr(
    number: int,
    head_sha: str,
    base_ref: str,
    base_sha: str,
) -> dict[str, object]:
    """Return one same-repository open PR targeting the supplied branch."""
    return {
        "number": number,
        "title": f"PR {number}",
        "html_url": f"https://github.com/ContextualWisdomLab/bandscope/pull/{number}",
        "state": "open",
        "base": {"ref": base_ref, "sha": base_sha},
        "head": {"sha": head_sha},
    }


def test_refresh_includes_direct_and_stacked_open_prs_with_exact_base_tips() -> None:
    """A complete queue retains PRs targeting develop and another live branch."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_stacked")
    live = {
        "incomplete_results": False,
        "pull_requests": [
            _live_pr(1116, "2" * 40, "develop", "d" * 40),
            _live_pr(968, "3" * 40, "docs/gap-baseline-2026-08-31", "e" * 40),
        ],
    }

    refreshed = refresher.build_refreshed_manifest(
        _seed(),
        live,
        base_sha="d" * 40,
        snapshot_date="2026-09-01",
        base_tips={
            "develop": "d" * 40,
            "docs/gap-baseline-2026-08-31": "e" * 40,
        },
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert set(by_number) == {968, 1116}
    assert by_number[1116]["base_ref"] == "develop"
    assert by_number[1116]["base_sha"] == "d" * 40
    assert by_number[968]["base_ref"] == "docs/gap-baseline-2026-08-31"
    assert by_number[968]["base_sha"] == "e" * 40

    verifier = _load_module(VERIFIER_PATH, "verify_open_pr_queue_stacked")
    verifier.validate_manifest(refreshed)


def test_refresh_uses_independently_resolved_tip_when_pr_base_snapshot_is_stale() -> None:
    """The live branch lookup, not the PR object's base SHA, owns current base identity."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_stale_base_snapshot")
    live = {
        "incomplete_results": False,
        "pull_requests": [
            _live_pr(1116, "2" * 40, "develop", "9" * 40),
            _live_pr(968, "3" * 40, "docs/gap-baseline-2026-08-31", "8" * 40),
        ],
    }

    refreshed = refresher.build_refreshed_manifest(
        _seed(),
        live,
        base_sha="d" * 40,
        snapshot_date="2026-09-01",
        base_tips={
            "develop": "d" * 40,
            "docs/gap-baseline-2026-08-31": "e" * 40,
        },
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[1116]["base_sha"] == "d" * 40
    assert by_number[968]["base_sha"] == "e" * 40


def test_refresh_rejects_base_without_independently_resolved_tip() -> None:
    """Every current PR target branch still needs a separately resolved live tip."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_missing_base_tip")
    live = {
        "incomplete_results": False,
        "pull_requests": [
            _live_pr(1116, "2" * 40, "develop", "d" * 40),
            _live_pr(968, "3" * 40, "docs/gap-baseline-2026-08-31", "8" * 40),
        ],
    }

    with pytest.raises(refresher.RefreshError, match="independently resolved base tip"):
        refresher.build_refreshed_manifest(
            _seed(),
            live,
            base_sha="d" * 40,
            snapshot_date="2026-09-01",
            base_tips={"develop": "d" * 40},
        )


def test_fetch_live_pull_page_does_not_filter_out_stacked_bases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The GitHub pulls request enumerates all open PRs, including stacked bases."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_all_bases")
    observed: dict[str, str] = {}

    def fake_request(target: str, token: str | None) -> tuple[object, str]:
        observed["target"] = target
        return [], ""

    monkeypatch.setattr(refresher, "_request_github_json", fake_request)
    items, has_next = refresher.fetch_live_pull_page(1, 100, None)

    assert items == []
    assert has_next is False
    assert "state=open" in observed["target"]
    assert "base=" not in observed["target"]


def test_fetch_live_branch_sha_encodes_branch_name_without_changing_authority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A slash-bearing base ref stays inside the fixed repository API authority."""
    refresher = _load_module(REFRESHER_PATH, "refresh_open_pr_queue_branch_tip")
    observed: dict[str, str] = {}

    def fake_request(target: str, token: str | None) -> tuple[object, str]:
        observed["target"] = target
        return {"commit": {"sha": "e" * 40}}, ""

    monkeypatch.setattr(refresher, "_request_github_json", fake_request)
    sha = refresher.fetch_live_branch_sha("docs/gap-baseline-2026-08-31", None)

    assert sha == "e" * 40
    expected_prefix = "/repos/ContextualWisdomLab/bandscope/branches/"
    assert observed["target"].startswith(expected_prefix)
    assert observed["target"].endswith("docs%2Fgap-baseline-2026-08-31")
