"""Regression contract for OpenSSF Scorecard evidence on pull-request heads."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ossf-scorecard.yml"
PR_OR_DEFAULT_BRANCH = (
    "github.event_name == 'pull_request' || github.ref == "
    "format('refs/heads/{0}', github.event.repository.default_branch)"
)
PR_SAFE_TRUSTED_REF = (
    "ref: ${{ github.event_name == 'pull_request' && "
    "github.event.pull_request.base.sha || github.ref_name }}"
)


def test_scorecard_produces_pr_code_scanning_evidence_without_pr_publishing() -> None:
    """Keep PR SARIF coverage while publishing only trusted default-branch runs."""
    contents = WORKFLOW.read_text(encoding="utf-8")

    assert "pull_request_target:" not in contents
    assert "  pull_request:\n    branches:\n      - develop\n      - main\n" in contents
    assert contents.count(f"if: {PR_OR_DEFAULT_BRANCH}") == 3
    assert (
        "publish_results: ${{ github.event_name != 'pull_request' && "
        "github.ref == format('refs/heads/{0}', github.event.repository.default_branch) }}"
        in contents
    )
    assert PR_SAFE_TRUSTED_REF in contents
