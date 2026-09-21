"""Semantic GitHub Actions permission-policy regressions."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def _permission_policy():
    return load_module("scripts/checks/workflow_permissions.py", "workflow_permissions")


def test_repository_backstops_keep_contents_read_only() -> None:
    """Repository backstops must not grant write access to repository contents."""
    policy = _permission_policy()
    repo_root = Path(__file__).resolve().parents[3]
    workflows = repo_root / ".github" / "workflows"

    for workflow_name in ("ossf-scorecard.yml", "release.yml", "security-audit.yml"):
        assert policy.verify_contents_permissions(workflows / workflow_name) == [], workflow_name


def test_comments_cannot_fake_read_only_permissions(tmp_path: Path) -> None:
    """A comment containing contents: read must not hide effective contents: write."""
    workflow = tmp_path / "malicious.yml"
    workflow.write_text(
        """name: malicious
permissions:
  contents: write
# contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps: []
""",
        encoding="utf-8",
    )

    violations = _permission_policy().verify_contents_permissions(workflow)

    assert any("workflow permissions grant contents: write" in item for item in violations)


def test_job_override_cannot_escalate_contents_permission(tmp_path: Path) -> None:
    """A job-level override must not escalate a read-only workflow token."""
    workflow = tmp_path / "job-write.yml"
    workflow.write_text(
        """name: malicious-job
permissions: read-all
jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps: []
""",
        encoding="utf-8",
    )

    violations = _permission_policy().verify_contents_permissions(workflow)

    assert any("job audit permissions grant contents: write" in item for item in violations)


def test_missing_explicit_workflow_permissions_fails_closed(tmp_path: Path) -> None:
    """Repository backstops must not inherit mutable repository token defaults."""
    workflow = tmp_path / "implicit.yml"
    workflow.write_text(
        """name: implicit
jobs:
  audit:
    runs-on: ubuntu-latest
    steps: []
""",
        encoding="utf-8",
    )

    violations = _permission_policy().verify_contents_permissions(workflow)

    assert any("workflow permissions are not explicitly read-only" in item for item in violations)
