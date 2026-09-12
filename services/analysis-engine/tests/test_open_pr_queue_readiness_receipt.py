"""Regression tests for exact-head BandScope merge-train readiness receipts."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
COLLECTOR_PATH = REPO_ROOT / "scripts" / "checks" / "collect_open_pr_readiness.py"


def _load_collector() -> ModuleType:
    sys.path.insert(0, str(COLLECTOR_PATH.parent))
    try:
        spec = importlib.util.spec_from_file_location("collect_open_pr_readiness", COLLECTOR_PATH)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.pop(0)


def test_required_check_receipt_rejects_skipped_or_missing_contexts() -> None:
    collector = _load_collector()
    policy = {
        "protected": True,
        "required_checks": [
            {"context": "ci / build-and-test", "app_id": 15368},
            {"context": "strix", "app_id": 15368},
        ],
    }
    observed = [
        {"context": "ci / build-and-test", "app_id": 15368, "passing": True},
        {"context": "strix", "app_id": 15368, "passing": False},
    ]

    state, failures = collector.evaluate_required_checks(policy, observed)

    assert state == "non_passing"
    assert failures == ["strix@15368"]


def test_required_check_receipt_requires_the_bound_app_identity() -> None:
    collector = _load_collector()
    policy = {
        "protected": True,
        "required_checks": [{"context": "security-audit", "app_id": 15368}],
    }
    observed = [{"context": "security-audit", "app_id": 999, "passing": True}]

    state, failures = collector.evaluate_required_checks(policy, observed)

    assert state == "non_passing"
    assert failures == ["security-audit@15368"]


def test_review_receipt_ignores_self_and_predecessor_head_approvals() -> None:
    collector = _load_collector()
    current_head = "a" * 40
    node = {
        "reviews": {
            "pageInfo": {"hasPreviousPage": False},
            "nodes": [
                {
                    "state": "APPROVED",
                    "author": {"login": "seonghobae"},
                    "commit": {"oid": current_head},
                },
                {
                    "state": "APPROVED",
                    "author": {"login": "reviewer"},
                    "commit": {"oid": "b" * 40},
                },
            ],
        }
    }

    decision, reviewed_sha, approvals = collector.derive_review_state(
        node, expected_head=current_head, pr_author="seonghobae"
    )

    assert decision == "review_required"
    assert reviewed_sha is None
    assert approvals == 0


def test_current_head_changes_request_overrides_current_head_approval() -> None:
    collector = _load_collector()
    current_head = "a" * 40
    node = {
        "reviews": {
            "pageInfo": {"hasPreviousPage": False},
            "nodes": [
                {
                    "state": "APPROVED",
                    "author": {"login": "reviewer-a"},
                    "commit": {"oid": current_head},
                },
                {
                    "state": "CHANGES_REQUESTED",
                    "author": {"login": "reviewer-b"},
                    "commit": {"oid": current_head},
                },
            ],
        }
    }

    decision, reviewed_sha, approvals = collector.derive_review_state(
        node, expected_head=current_head, pr_author="seonghobae"
    )

    assert decision == "changes_requested"
    assert reviewed_sha == current_head
    assert approvals == 1


def test_unresolved_actionable_threads_exclude_resolved_and_outdated_threads() -> None:
    collector = _load_collector()
    node = {
        "reviewThreads": {
            "pageInfo": {"hasNextPage": False},
            "nodes": [
                {"isResolved": False, "isOutdated": False},
                {"isResolved": True, "isOutdated": False},
                {"isResolved": False, "isOutdated": True},
            ],
        }
    }

    assert collector.unresolved_actionable_thread_count(node) == 1


def test_paginated_thread_evidence_fails_closed() -> None:
    collector = _load_collector()
    node = {
        "reviewThreads": {
            "pageInfo": {"hasNextPage": True},
            "nodes": [],
        }
    }

    with pytest.raises(collector.ReadinessError, match="pagination bound"):
        collector.unresolved_actionable_thread_count(node)


def test_receipt_cannot_pass_without_reviewed_decision_timestamp() -> None:
    collector = _load_collector()
    current_head = "a" * 40
    queue_entry = {
        "number": 968,
        "head_sha": current_head,
        "base_ref": "develop",
        "base_sha": "b" * 40,
        "draft": False,
        "initial_train": "T0",
        "initial_disposition": "product_readiness_baseline_program",
    }
    policy = {
        "protected": True,
        "required_checks": [{"context": "ci / build-and-test", "app_id": 15368}],
    }
    pr_node = {
        "number": 968,
        "headRefOid": current_head,
        "author": {"login": "seonghobae"},
        "reviewThreads": {
            "pageInfo": {"hasNextPage": False},
            "nodes": [],
        },
        "reviews": {
            "pageInfo": {"hasPreviousPage": False},
            "nodes": [
                {
                    "state": "APPROVED",
                    "author": {"login": "reviewer"},
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
    trains = {"T0": {"description": "Queue control", "issue": 966}}

    receipt = collector.build_receipt(
        queue_entry,
        policy=policy,
        pr_node=pr_node,
        trains=trains,
        captured_at="2026-09-02T01:00:00Z",
    )

    assert receipt["required_check_state"] == "passing"
    assert receipt["review_decision"] == "approved"
    assert receipt["unresolved_actionable_thread_count"] == 0
    assert receipt["decision_timestamp"] is None
    assert receipt["receipt_state"] == "non_passing"


def test_false_green_readiness_document_is_rejected() -> None:
    collector = _load_collector()
    document = {
        "schema_version": "1.0.0",
        "repository": "ContextualWisdomLab/bandscope",
        "captured_at": "2026-09-02T01:00:00Z",
        "open_pr_count": 1,
        "receipts": [
            {
                "number": 968,
                "head_sha": "a" * 40,
                "draft": False,
                "required_check_state": "non_passing",
                "review_decision": "approved",
                "unresolved_actionable_thread_count": 0,
                "decision_metadata_state": "complete",
                "receipt_state": "passing",
            }
        ],
    }

    with pytest.raises(collector.ReadinessError, match="false-green"):
        collector.validate_readiness_document(document)


def test_workflow_preserves_exact_head_readiness_artifact() -> None:
    workflow_path = REPO_ROOT / ".github" / "workflows" / "open-pr-queue-live.yml"
    workflow = workflow_path.read_text(encoding="utf-8")

    assert "python3 scripts/checks/collect_open_pr_readiness.py" in workflow
    assert "python3 scripts/checks/verify_open_pr_readiness.py" in workflow
    assert "docs/product-readiness/open-pr-readiness.json" in workflow
    assert "checks: read" in workflow
    assert "statuses: read" in workflow


def test_readiness_publication_rejects_symlink_parent(tmp_path: Path) -> None:
    collector = _load_collector()
    repository_root = tmp_path / "repo"
    repository_root.mkdir()
    real_parent = tmp_path / "outside"
    real_parent.mkdir()
    symlink_parent = repository_root / "docs"
    symlink_parent.symlink_to(real_parent, target_is_directory=True)

    with pytest.raises(collector.ReadinessError, match="symbolic links"):
        collector.write_atomic(
            {"schema_version": "1.0.0"},
            Path("docs/open-pr-readiness.json"),
            repository_root=repository_root,
        )
