"""Regression tests for reviewed merge-train disposition receipts."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
CHECKS_DIR = REPO_ROOT / "scripts" / "checks"


def _load(name: str) -> ModuleType:
    path = CHECKS_DIR / f"{name}.py"
    sys.path.insert(0, str(CHECKS_DIR))
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def _reviewed_seed() -> dict[str, object]:
    return {
        "schema_version": "1.0.0",
        "snapshot_date": "2026-09-02",
        "timezone": "Asia/Seoul",
        "repository": "ContextualWisdomLab/bandscope",
        "base_branch": "develop",
        "base_sha": "a" * 40,
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
                "base_sha": "a" * 40,
                "head_sha": "b" * 40,
                "head_sha_status": "exact_current_head",
                "disposition": "canonical_active",
                "decision_timestamp": "2026-09-02T02:30:00Z",
                "decision_rationale": "Canonical executable owner for issue #966.",
                "decision_owner": "issue:#966",
            }
        ],
    }


def _reviewed_succession_seed() -> dict[str, object]:
    """Return two reviewed overlapping PRs with one explicit supersession relation."""
    seed = _reviewed_seed()
    seed_entry = seed["pull_requests"][0]
    assert isinstance(seed_entry, dict)
    seed_entry.update(
        {
            "overlap_prs": [1131],
            "successor_pr": 1131,
            "disposition": "superseded_by",
            "decision_rationale": "All unique delta is preserved by PR #1131.",
        }
    )
    seed_successor = {
        "number": 1131,
        "title": "canonical successor",
        "url": "https://github.com/ContextualWisdomLab/bandscope/pull/1131",
        "initial_train": "T0",
        "initial_disposition": "triage_required",
        "base_ref": "develop",
        "base_sha": "a" * 40,
        "head_sha": "c" * 40,
        "head_sha_status": "exact_current_head",
        "draft": False,
        "updated_at": "2026-09-02T02:30:00Z",
        "predecessor_prs": [],
        "overlap_prs": [968],
        "successor_pr": None,
        "disposition": "canonical_active",
        "decision_timestamp": "2026-09-02T02:30:00Z",
        "decision_rationale": "Canonical surviving implementation.",
        "decision_owner": "issue:#966",
    }
    pull_requests = seed["pull_requests"]
    assert isinstance(pull_requests, list)
    pull_requests.append(seed_successor)
    seed["open_pr_count"] = 2
    return seed


def _live_pr(number: int, head_sha: str) -> dict[str, object]:
    return {
        "number": number,
        "title": f"PR {number}",
        "html_url": f"https://github.com/ContextualWisdomLab/bandscope/pull/{number}",
        "state": "open",
        "draft": False,
        "updated_at": "2026-09-02T02:31:00Z",
        "base": {"ref": "develop", "sha": "a" * 40},
        "head": {"sha": head_sha},
    }


def test_live_refresh_preserves_reviewed_decision_and_marks_new_pr_refresh_required() -> None:
    refresher = _load("refresh_open_pr_queue")
    live = {
        "incomplete_results": False,
        "pull_requests": [_live_pr(968, "b" * 40), _live_pr(1131, "c" * 40)],
    }

    refreshed = refresher.build_refreshed_manifest(
        _reviewed_seed(),
        live,
        base_sha="a" * 40,
        snapshot_date="2026-09-02",
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[968]["disposition"] == "canonical_active"
    assert by_number[968]["decision_timestamp"] == "2026-09-02T02:30:00Z"
    assert by_number[968]["decision_rationale"] == "Canonical executable owner for issue #966."
    assert by_number[968]["decision_owner"] == "issue:#966"
    assert by_number[1131]["disposition"] == "refresh_required"
    assert by_number[1131]["decision_timestamp"] is None
    assert by_number[1131]["decision_rationale"] is None
    assert by_number[1131]["decision_owner"] is None


def test_live_refresh_preserves_reviewed_succession_when_related_identity_is_unchanged() -> None:
    """Stable own and related identities retain an explicitly reviewed succession decision."""
    refresher = _load("refresh_open_pr_queue")
    refreshed = refresher.build_refreshed_manifest(
        _reviewed_succession_seed(),
        {
            "incomplete_results": False,
            "pull_requests": [_live_pr(968, "b" * 40), _live_pr(1131, "c" * 40)],
        },
        base_sha="a" * 40,
        snapshot_date="2026-09-02",
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[968]["disposition"] == "superseded_by"
    assert by_number[968]["decision_timestamp"] == "2026-09-02T02:30:00Z"
    assert by_number[968]["decision_rationale"] == "All unique delta is preserved by PR #1131."


def test_live_refresh_invalidates_reviewed_succession_when_successor_head_moves() -> None:
    """A supersession decision is stale when its reviewed successor identity advances."""
    refresher = _load("refresh_open_pr_queue")
    refreshed = refresher.build_refreshed_manifest(
        _reviewed_succession_seed(),
        {
            "incomplete_results": False,
            "pull_requests": [_live_pr(968, "b" * 40), _live_pr(1131, "d" * 40)],
        },
        base_sha="a" * 40,
        snapshot_date="2026-09-02",
    )

    by_number = {item["number"]: item for item in refreshed["pull_requests"]}
    assert by_number[968]["disposition"] == "refresh_required"
    assert by_number[968]["decision_timestamp"] is None
    assert by_number[968]["decision_rationale"] is None
    assert by_number[968]["decision_owner"] is None


def test_live_refresh_fails_closed_when_reviewed_successor_leaves_open_queue() -> None:
    """A removed successor cannot silently leave a reviewed supersession receipt intact."""
    refresher = _load("refresh_open_pr_queue")
    with pytest.raises(refresher.RefreshError):
        refresher.build_refreshed_manifest(
            _reviewed_succession_seed(),
            {
                "incomplete_results": False,
                "pull_requests": [_live_pr(968, "b" * 40)],
            },
            base_sha="a" * 40,
            snapshot_date="2026-09-02",
        )


def test_complete_reviewed_decision_can_participate_in_passing_exact_head_receipt() -> None:
    collector = _load("collect_open_pr_readiness")
    current_head = "b" * 40
    queue_entry = _reviewed_seed()["pull_requests"][0]
    assert isinstance(queue_entry, dict)
    queue_entry.update(
        {
            "base_ref": "develop",
            "base_sha": "a" * 40,
            "draft": False,
        }
    )
    policy = {
        "protected": True,
        "required_checks": [{"context": "ci / build-and-test", "app_id": 15368}],
    }
    pr_node = {
        "number": 968,
        "headRefOid": current_head,
        "author": {"login": "seonghobae"},
        "reviewThreads": {"pageInfo": {"hasNextPage": False}, "nodes": []},
        "reviews": {
            "pageInfo": {"hasPreviousPage": False},
            "nodes": [
                {
                    "state": "APPROVED",
                    "author": {"login": "independent-reviewer"},
                    "commit": {"oid": current_head},
                }
            ],
        },
        "commits": {
            "nodes": [
                {
                    "commit": {
                        "oid": current_head,
                        "statusCheckRollup": {
                            "contexts": {
                                "pageInfo": {"hasNextPage": False},
                                "nodes": [
                                    {
                                        "__typename": "CheckRun",
                                        "name": "ci / build-and-test",
                                        "status": "COMPLETED",
                                        "conclusion": "SUCCESS",
                                        "app": {"databaseId": 15368},
                                    }
                                ],
                            }
                        },
                    }
                }
            ]
        },
    }

    receipt = collector.build_receipt(
        queue_entry,
        policy=policy,
        pr_node=pr_node,
        trains={"T0": {"description": "Queue control", "issue": 966}},
        captured_at="2026-09-02T02:32:00Z",
    )

    assert receipt["decision_metadata_state"] == "complete"
    assert receipt["decision_timestamp"] == "2026-09-02T02:30:00Z"
    assert receipt["decision_rationale"] == "Canonical executable owner for issue #966."
    assert receipt["decision_owner"] == "issue:#966"
    assert receipt["receipt_state"] == "passing"
