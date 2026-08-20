"""Regression tests for workflow-registry recursive-tree entry authority."""

from __future__ import annotations

from conftest import load_module


def test_directory_named_like_workflow_cannot_prove_active_source(monkeypatch) -> None:
    """Only a Git blob may satisfy an active repository workflow registry path."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_tree_entry_type_test",
    )
    client = audit.GitHubRegistryClient()
    workflow_path = ".github/workflows/not-a-file.yml"
    real_workflow_path = ".github/workflows/ci.yml"

    def fake_get_json(_url: str):
        return (
            {
                "truncated": False,
                "tree": [
                    {"path": ".github", "type": "tree"},
                    {"path": ".github/workflows", "type": "tree"},
                    {"path": workflow_path, "type": "tree"},
                    {"path": real_workflow_path, "type": "blob"},
                ],
            },
            200,
        )

    monkeypatch.setattr(client, "_get_json", fake_get_json)

    tree_paths = client.fetch_tree_paths("ContextualWisdomLab/bandscope", "a" * 40)
    records = audit.classify_workflows(
        [
            {
                "id": 1,
                "name": "Not a file",
                "path": workflow_path,
                "state": "active",
            }
        ],
        tree_paths,
    )

    assert real_workflow_path in tree_paths
    assert workflow_path not in tree_paths
    assert records[0]["classification"] == "unresolved"
    assert records[0]["reason"] == (
        "active registry path is absent from the bound default tree; "
        "branch provenance is unproven"
    )
