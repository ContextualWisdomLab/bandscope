"""Workflow regressions for the live BandScope merge-train queue contract."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "open-pr-queue-live.yml"
EXACT_HEAD_EXPR = "${{ github.event.pull_request.head.sha || github.sha }}"


def test_live_queue_refresh_cannot_be_skipped_by_changed_path() -> None:
    """Every push to the canonical queue branch must produce exact-head queue evidence."""
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    push_block = workflow.split("  push:\n", maxsplit=1)[1].split(
        "  pull_request:\n", maxsplit=1
    )[0]

    assert "      - docs/bandscope-product-readiness-baseline" in push_block
    assert "    paths:" not in push_block


def test_live_queue_refresh_has_pr_synchronize_admission() -> None:
    """A queue-head PR update must have a second exact-head admission path."""
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    pull_request_block = workflow.split("  pull_request:\n", maxsplit=1)[1].split(
        "  workflow_dispatch:\n", maxsplit=1
    )[0]

    assert "      - docs/gap-baseline-2026-08-31" in pull_request_block
    assert "      - opened" in pull_request_block
    assert "      - reopened" in pull_request_block
    assert "      - synchronize" in pull_request_block
    assert "    paths:" not in pull_request_block


def test_pull_request_queue_evidence_checks_out_and_names_the_exact_head() -> None:
    """PR-triggered queue evidence must describe the PR head, not the synthetic merge ref."""
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    assert f"          ref: {EXACT_HEAD_EXPR}" in workflow
    assert f"          name: open-pr-queue-{EXACT_HEAD_EXPR}" in workflow
