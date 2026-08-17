"""Regressions for workflow identities that originate outside protected develop."""

from __future__ import annotations

from conftest import load_module


def test_active_off_default_workflow_fails_closed_without_branch_provenance() -> None:
    """A live workflow absent from develop is not proof that its source was deleted."""
    audit_module = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_branch_provenance_test",
    )
    records = audit_module.classify_workflows(
        [
            {
                "id": 336046185,
                "name": "node-minimum-compatibility",
                "path": ".github/workflows/node-minimum-compatibility.yml",
                "state": "active",
            },
        ],
        {".github/workflows/ci.yml"},
    )

    assert records[0]["classification"] == "unresolved"
    assert records[0]["reason"] == (
        "active registry path is absent from the bound default tree; "
        "branch provenance is unproven"
    )
