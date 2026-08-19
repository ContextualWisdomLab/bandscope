"""Regression tests for the read-only GitHub Actions workflow-registry audit."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from conftest import load_module


@pytest.fixture()
def audit_module():
    """Load the repository-owned workflow registry auditor."""
    return load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_test",
    )


def _workflow(
    workflow_id: int,
    path: str,
    *,
    state: str = "active",
    name: str = "workflow",
    source: str | None = None,
) -> dict[str, Any]:
    workflow: dict[str, Any] = {
        "id": workflow_id,
        "path": path,
        "state": state,
        "name": name,
    }
    if source is not None:
        workflow["source"] = source
    return workflow


def test_present_bootstrap_name_is_not_disabled_by_name(audit_module) -> None:
    """A legitimate checked-in bootstrap workflow remains present regardless of its name."""
    workflow = _workflow(
        11,
        ".github/workflows/bootstrap-live-release.yml",
        name="Bootstrap live release",
    )

    records = audit_module.classify_workflows(
        [workflow],
        {".github/workflows/bootstrap-live-release.yml"},
    )

    assert records == [
        {
            "workflow_id": 11,
            "name": "Bootstrap live release",
            "path": ".github/workflows/bootstrap-live-release.yml",
            "state": "active",
            "classification": "present",
            "reason": "active registry path exists at the bound tree",
        },
    ]


def test_missing_workflow_needs_branch_provenance(audit_module) -> None:
    """Default-tree absence alone cannot prove repository workflow deletion."""
    records = audit_module.classify_workflows(
        [_workflow(12, ".github/workflows/finalize-old-slice.yml")],
        {".github/workflows/ci.yml"},
    )

    expected_reason = (
        "active registry path is absent from the bound default tree; "
        "branch provenance is unproven"
    )
    assert records[0]["classification"] == "unresolved"
    assert records[0]["reason"] == expected_reason


def test_inactive_missing_workflow_remains_disabled(audit_module) -> None:
    """A previously disabled orphan must not be mistaken for an active writer."""
    records = audit_module.classify_workflows(
        [
            _workflow(
                13,
                ".github/workflows/finalize-old-slice.yml",
                state="disabled_manually",
            ),
        ],
        set(),
    )

    assert records[0]["classification"] == "disabled"
    assert records[0]["reason"] == "registry state is not active"


def test_github_dynamic_identity_matches_live_registry_shape(audit_module) -> None:
    """GitHub dynamic identities are recognized from the API path without a source field."""
    records = audit_module.classify_workflows(
        [
            _workflow(
                14,
                "dynamic/agents/openai-code-agent",
                name="OpenAI Codex",
            )
        ],
        set(),
    )

    assert records[0]["classification"] == "github_dynamic"
    assert (
        records[0]["reason"]
        == "workflow path identifies a GitHub-managed dynamic identity"
    )


def test_unrecognized_active_non_repository_path_fails_closed(audit_module) -> None:
    """Only the observed dynamic namespace may bypass repository-path classification."""
    records = audit_module.classify_workflows(
        [_workflow(141, "external/workflows/not-repository-backed")],
        set(),
    )

    assert records[0]["classification"] == "unresolved"
    assert records[0]["reason"] == "active registry path is not repository workflow YAML"


def test_source_field_cannot_override_repository_path_evidence(audit_module) -> None:
    """Auxiliary metadata cannot prove deletion or GitHub ownership."""
    records = audit_module.classify_workflows(
        [
            _workflow(
                142,
                ".github/workflows/deleted-repair.yml",
                source="github",
            )
        ],
        set(),
    )

    expected_reason = (
        "active registry path is absent from the bound default tree; "
        "branch provenance is unproven"
    )
    assert records[0]["classification"] == "unresolved"
    assert records[0]["reason"] == expected_reason


def test_malformed_workflow_fails_closed_as_unresolved(audit_module) -> None:
    """Incomplete registry objects remain unresolved rather than being guessed."""
    records = audit_module.classify_workflows(
        [{"id": 15, "path": ".github/workflows/ci.yml"}],
        {".github/workflows/ci.yml"},
    )

    assert records[0]["classification"] == "unresolved"
    assert "missing or invalid" in records[0]["reason"]


def test_duplicate_workflow_id_fails_closed(audit_module) -> None:
    """A reused workflow id with conflicting paths cannot be classified by path alone."""
    records = audit_module.classify_workflows(
        [
            _workflow(16, ".github/workflows/old.yml"),
            _workflow(16, ".github/workflows/new.yml"),
        ],
        {".github/workflows/new.yml"},
    )

    assert {record["classification"] for record in records} == {"unresolved"}
    assert all(
        record["reason"] == "duplicate workflow id in registry snapshot"
        for record in records
    )


def test_collect_paginated_workflows_requires_complete_receipts(audit_module) -> None:
    """The detector must enumerate every page before it trusts the registry snapshot."""
    pages = {
        1: (
            {"total_count": 3, "workflows": [_workflow(1, ".github/workflows/a.yml")]},
            {"page": 1, "status": 200, "item_count": 1},
        ),
        2: (
            {"total_count": 3, "workflows": [_workflow(2, ".github/workflows/b.yml")]},
            {"page": 2, "status": 200, "item_count": 1},
        ),
        3: (
            {"total_count": 3, "workflows": [_workflow(3, ".github/workflows/c.yml")]},
            {"page": 3, "status": 200, "item_count": 1},
        ),
    }

    workflows, receipts = audit_module.collect_paginated_workflows(
        lambda page, _per_page: pages[page],
        per_page=1,
    )

    assert [workflow["id"] for workflow in workflows] == [1, 2, 3]
    assert [receipt["page"] for receipt in receipts] == [1, 2, 3]
    assert all(receipt["status"] == 200 for receipt in receipts)


def test_collect_paginated_workflows_rejects_incomplete_pagination(audit_module) -> None:
    """An early empty page is evidence loss, not a clean inventory."""
    pages = {
        1: (
            {"total_count": 2, "workflows": [_workflow(1, ".github/workflows/a.yml")]},
            {"page": 1, "status": 200, "item_count": 1},
        ),
        2: (
            {"total_count": 2, "workflows": []},
            {"page": 2, "status": 200, "item_count": 0},
        ),
    }

    with pytest.raises(audit_module.AuditError, match="pagination ended before total_count"):
        audit_module.collect_paginated_workflows(
            lambda page, _per_page: pages[page],
            per_page=1,
        )


def test_collect_paginated_workflows_rejects_count_drift(audit_module) -> None:
    """Changing total_count during pagination invalidates the snapshot."""
    pages = {
        1: (
            {"total_count": 2, "workflows": [_workflow(1, ".github/workflows/a.yml")]},
            {"page": 1, "status": 200, "item_count": 1},
        ),
        2: (
            {"total_count": 3, "workflows": [_workflow(2, ".github/workflows/b.yml")]},
            {"page": 2, "status": 200, "item_count": 1},
        ),
    }

    with pytest.raises(audit_module.AuditError, match="total_count changed during pagination"):
        audit_module.collect_paginated_workflows(
            lambda page, _per_page: pages[page],
            per_page=1,
        )


@dataclass
class _FakeClient:
    """Deterministic client fixture for the repository-level snapshot contract."""

    ref_shas: list[str]
    workflows: list[dict[str, Any]]
    tree_paths: set[str]

    def fetch_ref_sha(self, _repository: str, _branch: str) -> str:
        return self.ref_shas.pop(0)

    def fetch_workflows(self, _repository: str):
        return self.workflows, [
            {"page": 1, "status": 200, "item_count": len(self.workflows)}
        ]

    def fetch_tree_paths(self, _repository: str, _sha: str):
        return self.tree_paths


def test_audit_repository_binds_registry_to_unchanged_default_branch(audit_module) -> None:
    """The report records the exact branch SHA and refuses stale branch evidence."""
    client = _FakeClient(
        ref_shas=["a" * 40, "a" * 40],
        workflows=[_workflow(17, ".github/workflows/ci.yml")],
        tree_paths={".github/workflows/ci.yml"},
    )

    report = audit_module.audit_repository(
        client,
        repository="ContextualWisdomLab/bandscope",
        branch="develop",
        observed_at="2026-08-16T00:00:00Z",
    )

    assert report["bound_ref_sha"] == "a" * 40
    assert report["observed_at"] == "2026-08-16T00:00:00Z"
    assert report["summary"] == {
        "present": 1,
        "orphaned_deleted": 0,
        "disabled": 0,
        "github_dynamic": 0,
        "unresolved": 0,
    }


def test_audit_repository_rejects_branch_movement(audit_module) -> None:
    """A default-branch move during the audit invalidates every path classification."""
    client = _FakeClient(
        ref_shas=["a" * 40, "b" * 40],
        workflows=[_workflow(18, ".github/workflows/ci.yml")],
        tree_paths={".github/workflows/ci.yml"},
    )

    with pytest.raises(audit_module.AuditError, match="default branch moved during audit"):
        audit_module.audit_repository(
            client,
            repository="ContextualWisdomLab/bandscope",
            branch="develop",
            observed_at="2026-08-16T00:00:00Z",
        )


def test_audit_repository_propagates_tree_truncation(audit_module) -> None:
    """A truncated tree cannot prove that an advertised workflow source is absent."""

    class TruncatedClient(_FakeClient):
        def fetch_tree_paths(self, _repository: str, _sha: str):
            raise audit_module.AuditError("recursive tree response was truncated")

    client = TruncatedClient(
        ref_shas=["a" * 40],
        workflows=[_workflow(19, ".github/workflows/ci.yml")],
        tree_paths=set(),
    )

    with pytest.raises(audit_module.AuditError, match="recursive tree response was truncated"):
        audit_module.audit_repository(
            client,
            repository="ContextualWisdomLab/bandscope",
            branch="develop",
            observed_at="2026-08-16T00:00:00Z",
        )


def test_audit_repository_rejects_same_count_registry_replacement(audit_module) -> None:
    """A same-size identity replacement must invalidate the registry snapshot."""

    class ReplacedRegistryClient:
        def __init__(self) -> None:
            self.ref_shas = ["a" * 40, "a" * 40]
            self.workflow_snapshots = [
                [_workflow(20, ".github/workflows/ci.yml", name="CI")],
                [_workflow(21, ".github/workflows/release.yml", name="Release")],
            ]

        def fetch_ref_sha(self, _repository: str, _branch: str) -> str:
            return self.ref_shas.pop(0)

        def fetch_workflows(self, _repository: str):
            workflows = self.workflow_snapshots.pop(0)
            return workflows, [
                {"page": 1, "status": 200, "item_count": len(workflows)}
            ]

        def fetch_tree_paths(self, _repository: str, _sha: str):
            return {
                ".github/workflows/ci.yml",
                ".github/workflows/release.yml",
            }

    with pytest.raises(audit_module.AuditError, match="workflow registry changed during audit"):
        audit_module.audit_repository(
            ReplacedRegistryClient(),
            repository="ContextualWisdomLab/bandscope",
            branch="develop",
            observed_at="2026-08-16T00:00:00Z",
        )
