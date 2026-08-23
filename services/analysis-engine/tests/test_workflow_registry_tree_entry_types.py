"""Regression tests for workflow-registry recursive-tree entry authority."""

from __future__ import annotations

from conftest import load_module


def test_only_regular_blob_can_prove_active_workflow_source(monkeypatch) -> None:
    """Directories and symlink blobs cannot satisfy an active workflow registry path."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_tree_entry_type_test",
    )
    client = audit.GitHubRegistryClient()
    directory_path = ".github/workflows/not-a-file.yml"
    symlink_path = ".github/workflows/not-yaml-source.yml"
    real_workflow_path = ".github/workflows/ci.yml"

    def fake_get_json(_url: str):
        return (
            {
                "truncated": False,
                "tree": [
                    {"path": ".github", "type": "tree", "mode": "040000"},
                    {"path": ".github/workflows", "type": "tree", "mode": "040000"},
                    {"path": directory_path, "type": "tree", "mode": "040000"},
                    {"path": symlink_path, "type": "blob", "mode": "120000"},
                    {"path": real_workflow_path, "type": "blob", "mode": "100644"},
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
                "name": "Directory masquerade",
                "path": directory_path,
                "state": "active",
            },
            {
                "id": 2,
                "name": "Symlink masquerade",
                "path": symlink_path,
                "state": "active",
            },
        ],
        tree_paths,
    )

    assert real_workflow_path in tree_paths
    assert directory_path not in tree_paths
    assert symlink_path not in tree_paths
    assert [record["classification"] for record in records] == ["unresolved", "unresolved"]
    assert all(
        record["reason"]
        == (
            "active registry path is absent from the bound default tree; "
            "branch provenance is unproven"
        )
        for record in records
    )


def test_duplicate_recursive_tree_paths_fail_closed(monkeypatch) -> None:
    """Contradictory duplicate path evidence cannot manufacture workflow presence."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_duplicate_tree_path_test",
    )
    client = audit.GitHubRegistryClient()
    workflow_path = ".github/workflows/ci.yml"

    def fake_get_json(_url: str):
        return (
            {
                "truncated": False,
                "tree": [
                    {"path": workflow_path, "type": "blob", "mode": "100644"},
                    {"path": workflow_path, "type": "blob", "mode": "120000"},
                ],
            },
            200,
        )

    monkeypatch.setattr(client, "_get_json", fake_get_json)

    try:
        client.fetch_tree_paths("ContextualWisdomLab/bandscope", "a" * 40)
    except audit.AuditError as error:
        assert str(error) == "recursive tree contains a duplicate path"
    else:
        raise AssertionError("duplicate recursive-tree paths must fail closed")


def test_recursive_tree_paths_are_not_whitespace_normalized(monkeypatch) -> None:
    """A distinct whitespace-suffixed Git path cannot prove canonical workflow presence."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_whitespace_tree_path_test",
    )
    client = audit.GitHubRegistryClient()
    canonical_path = ".github/workflows/ci.yml"
    distinct_git_path = f"{canonical_path} "

    def fake_get_json(_url: str):
        return (
            {
                "truncated": False,
                "tree": [
                    {"path": distinct_git_path, "type": "blob", "mode": "100644"},
                ],
            },
            200,
        )

    monkeypatch.setattr(client, "_get_json", fake_get_json)

    tree_paths = client.fetch_tree_paths("ContextualWisdomLab/bandscope", "a" * 40)

    assert distinct_git_path in tree_paths
    assert canonical_path not in tree_paths


def test_registry_path_and_state_are_not_whitespace_normalized() -> None:
    """Whitespace-altered registry authority must stay unresolved rather than canonicalized."""
    audit = load_module(
        "scripts/checks/audit_workflow_registry.py",
        "audit_workflow_registry_whitespace_registry_authority_test",
    )
    canonical_path = ".github/workflows/ci.yml"

    records = audit.classify_workflows(
        [
            {
                "id": 1,
                "name": "Whitespace path",
                "path": f"{canonical_path} ",
                "state": "active",
            },
            {
                "id": 2,
                "name": "Whitespace state",
                "path": canonical_path,
                "state": " active ",
            },
        ],
        {canonical_path},
    )

    assert [record["classification"] for record in records] == ["unresolved", "unresolved"]
