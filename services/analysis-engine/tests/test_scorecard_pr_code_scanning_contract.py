"""Regression contract for repository-local OpenSSF Scorecard ownership."""

from __future__ import annotations

from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SCORECARD_WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "ossf-scorecard.yml"
DEFAULT_BRANCH_GUARD = "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"


def test_local_scorecard_defers_pull_request_evidence_to_central_required_workflow() -> None:
    """Keep PR Scorecard evidence single-owned by the central required workflow."""
    workflow_text = SCORECARD_WORKFLOW_PATH.read_text(encoding="utf-8")

    assert "central required Scorecard PR workflow" in workflow_text
    assert "  pull_request:\n" not in workflow_text
    assert "pull_request_target:" not in workflow_text


def test_local_scorecard_publishes_only_from_the_default_branch() -> None:
    """Keep repository publication and SARIF upload scoped to trusted default-branch runs."""
    workflow_text = SCORECARD_WORKFLOW_PATH.read_text(encoding="utf-8")

    assert workflow_text.count(f"if: {DEFAULT_BRANCH_GUARD}") == 3
    publish_lines = [
        line.strip()
        for line in workflow_text.splitlines()
        if line.strip().startswith("publish_results:")
    ]
    assert publish_lines == [f"publish_results: ${{{{ {DEFAULT_BRANCH_GUARD} }}}}"]
    assert "ref: ${{ github.ref_name }}" in workflow_text
