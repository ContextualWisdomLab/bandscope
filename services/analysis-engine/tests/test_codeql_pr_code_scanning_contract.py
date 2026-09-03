"""Contract tests for BandScope's local/central CodeQL ownership boundary."""

from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CODEQL_WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "codeql.yml"


def _codeql_workflow_text() -> str:
    """Return the checked-in repository-local CodeQL workflow text."""
    return CODEQL_WORKFLOW_PATH.read_text(encoding="utf-8")


def test_local_codeql_defers_pull_request_evidence_to_central_required_workflow() -> None:
    """Keep PR scanning single-owned by the central required CodeQL workflow."""
    workflow_text = _codeql_workflow_text()

    assert "central required CodeQL PR workflow" in workflow_text
    assert "  pull_request:\n" not in workflow_text
    assert "pull_request_target:" not in workflow_text


def test_local_codeql_retains_protected_branch_push_reporting() -> None:
    """Keep repository-local CodeQL reporting on protected-branch pushes."""
    workflow_text = _codeql_workflow_text()
    push_section = workflow_text.split("  push:\n", 1)[1].split("  workflow_dispatch:\n", 1)[0]

    assert "    branches:\n" in push_section
    assert "      - develop\n" in push_section
    assert "      - main\n" in push_section
