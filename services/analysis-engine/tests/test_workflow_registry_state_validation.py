"""Fail-closed regressions for GitHub Actions workflow state classification."""

from __future__ import annotations

from conftest import load_module


def _load_audit():
    """Load the repository-owned workflow registry auditor."""
    return load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_state_validation_test",
    )


def test_unknown_registry_state_fails_closed_as_unresolved() -> None:
    """An unrecognized lifecycle state must not be trusted as a disabled workflow."""
    audit = _load_audit()

    records = audit.classify_workflows(
        [
            {
                "id": 901,
                "name": "Unexpected lifecycle state",
                "path": ".github/workflows/legacy.yml",
                "state": "disabled_by_future_policy",
            },
        ],
        set(),
    )

    assert records == [
        {
            "workflow_id": 901,
            "name": "Unexpected lifecycle state",
            "path": ".github/workflows/legacy.yml",
            "state": "disabled_by_future_policy",
            "classification": "unresolved",
            "reason": "unknown workflow registry state",
        },
    ]
