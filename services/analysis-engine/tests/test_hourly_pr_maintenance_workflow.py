"""Contract tests for the hourly central PR maintenance caller."""

from __future__ import annotations

from pathlib import Path


CENTRAL_WORKFLOW_REVISION = "5983b41ace75040c1d81818171ca7d0f3653254e"


def _workflow_text() -> str:
    """Return the checked-in hourly PR maintenance workflow text."""
    repo_root = Path(__file__).resolve().parents[3]
    return (
        repo_root / ".github" / "workflows" / "hourly-pr-maintenance.yml"
    ).read_text(encoding="utf-8")


def test_hourly_pr_maintenance_calls_central_review_fix_scheduler() -> None:
    """The hourly loop delegates review fixes to one immutable central revision."""
    workflow = _workflow_text()

    assert 'cron: "17 * * * *"' in workflow
    assert (
        "uses: ContextualWisdomLab/.github/.github/workflows/"
        f"pr-review-fix-scheduler.yml@{CENTRAL_WORKFLOW_REVISION}"
    ) in workflow
    assert "target_repository: ContextualWisdomLab/bandscope" in workflow
    assert 'base_branch: "develop"' in workflow
    assert 'retry_hours: "1"' in workflow
    assert 'max_dispatches: "3"' in workflow
    assert f'canonical_ref: "{CENTRAL_WORKFLOW_REVISION}"' in workflow
    assert "canonical_ref: main" not in workflow
    assert workflow.count("secrets: inherit") == 2


def test_hourly_pr_maintenance_calls_central_merge_scheduler() -> None:
    """The same loop rechecks approvals, checks, branch freshness, and merges."""
    workflow = _workflow_text()

    assert (
        "uses: ContextualWisdomLab/.github/.github/workflows/"
        f"pr-review-merge-scheduler.yml@{CENTRAL_WORKFLOW_REVISION}"
    ) in workflow
    assert "needs: review-fix" in workflow
    assert 'base_branch: "develop"' in workflow
    assert "trigger_reviews: true" in workflow
    assert 'review_dispatch_limit: "3"' in workflow
    assert 'branch_update_limit: "3"' in workflow
    assert "enable_auto_merge: true" in workflow
    assert "merge_mode: direct_or_auto" in workflow
    assert "update_branches: true" in workflow
    assert "project_flow: git-flow" in workflow


def test_hourly_pr_maintenance_grants_only_called_workflow_permissions() -> None:
    """The caller grants the exact union needed by both central workflows."""
    workflow = _workflow_text()

    expected_permissions = """permissions:
  actions: write
  checks: read
  contents: write
  id-token: write
  issues: write
  pull-requests: write
  statuses: read
"""
    assert expected_permissions in workflow
    assert "administration: write" not in workflow
    assert "security-events: write" not in workflow
    assert "runs-on:" not in workflow
    assert "gh pr merge" not in workflow
