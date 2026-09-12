"""Regression coverage for reviewed queue decisions after target-base movement."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[3]
REFRESHER_PATH = REPO_ROOT / "scripts" / "checks" / "refresh_open_pr_queue.py"


def _load_refresher() -> ModuleType:
    """Load the queue refresher from its repository-owned operator path."""
    sys.path.insert(0, str(REFRESHER_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location("refresh_open_pr_queue", REFRESHER_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _reviewed_seed() -> dict[str, object]:
    """Return one reviewed PR whose decision was made against the old base tip."""
    old_base = "a" * 40
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-09-02",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": old_base,
        "open_pr_count": 1,
        "authority_note": "Refresh exact live evidence before action.",
        "trains": {"T0": {"description": "Queue control", "issue": 966}},
        "pull_requests": [
            {
                "number": 968,
                "title": "queue control",
                "url": "https://github.com/ContextualWisdomLab/bandscope/pull/968",
                "initial_train": "T0",
                "initial_disposition": "product_readiness_baseline_program",
                "base_ref": "develop",
                "base_sha": old_base,
                "head_sha": "b" * 40,
                "head_sha_status": "exact_current_head",
                "draft": False,
                "updated_at": "2026-09-02T02:31:00Z",
                "predecessor_prs": [],
                "overlap_prs": [],
                "successor_pr": None,
                "disposition": "canonical_active",
                "decision_timestamp": "2026-09-02T02:30:00Z",
                "decision_rationale": "Canonical executable owner for issue #966.",
                "decision_owner": "issue:#966",
            }
        ],
    }


def test_live_refresh_invalidates_reviewed_decision_when_base_tip_moves() -> None:
    """A stable PR head cannot retain routing evidence reviewed against another base tree."""
    refresher = _load_refresher()
    new_base = "c" * 40
    live = {
        "incomplete_results": False,
        "pull_requests": [
            {
                "number": 968,
                "title": "queue control",
                "html_url": "https://github.com/ContextualWisdomLab/bandscope/pull/968",
                "state": "open",
                "draft": False,
                "updated_at": "2026-09-02T03:31:00Z",
                "base": {"ref": "develop", "sha": "a" * 40},
                "head": {"sha": "b" * 40},
            }
        ],
    }

    refreshed = refresher.build_refreshed_manifest(
        _reviewed_seed(),
        live,
        base_sha=new_base,
        snapshot_date="2026-09-02",
        base_tips={"develop": new_base},
    )

    entry = refreshed["pull_requests"][0]
    assert entry["head_sha"] == "b" * 40
    assert entry["base_sha"] == new_base
    assert entry["disposition"] == "refresh_required"
    assert entry["decision_timestamp"] is None
    assert entry["decision_rationale"] is None
    assert entry["decision_owner"] is None
