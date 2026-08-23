"""Regressions for workflow identities originating outside protected develop."""

from __future__ import annotations

from conftest import load_module


def test_off_default_workflow_without_branch_provenance_is_unresolved() -> None:
    """An active workflow absent from develop has unproven branch provenance."""
    audit_module = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_branch_provenance_test",
    )
    workflow: dict[str, object] = {"id": 336046185}
    workflow["name"] = "node-minimum-compatibility"
    workflow["path"] = ".github/workflows/node-minimum-compatibility.yml"
    workflow["state"] = "active"
    records = audit_module.classify_workflows([workflow], {".github/workflows/ci.yml"})

    record = records[0]
    assert record["classification"] == "unresolved"
    reason_prefix = "active registry path is absent from the bound default tree; "
    expected_reason = reason_prefix + "branch provenance is unproven"
    assert record["reason"] == expected_reason
