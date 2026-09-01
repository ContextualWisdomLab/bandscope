"""Workflow regressions for the live BandScope merge-train queue contract."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "open-pr-queue-live.yml"


def test_live_queue_refresh_cannot_be_skipped_by_changed_path() -> None:
    """Every push to the canonical queue branch must produce exact-head queue evidence."""
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    push_block = workflow.split("  push:\n", maxsplit=1)[1].split(
        "  workflow_dispatch:\n", maxsplit=1
    )[0]

    assert "      - docs/bandscope-product-readiness-baseline" in push_block
    assert "    paths:" not in push_block
