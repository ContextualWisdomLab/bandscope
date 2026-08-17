"""Identity-edge regressions for the workflow registry lifecycle audit."""

from __future__ import annotations

from conftest import load_module


def test_renamed_workflow_id_uses_current_registry_path() -> None:
    """A reused id after a path rename is judged by its current path, not historical naming."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_identity_test",
    )
    records = audit.classify_workflows(
        [
            {
                "id": 21,
                "name": "Current release verification",
                "path": ".github/workflows/release.yml",
                "state": "active",
            }
        ],
        {".github/workflows/release.yml"},
    )

    assert records[0]["classification"] == "present"
    assert records[0]["path"] == ".github/workflows/release.yml"
