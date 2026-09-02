"""Contract tests for BandScope pull-request CodeQL evidence."""

from __future__ import annotations

from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CODEQL_WORKFLOW_PATH = REPOSITORY_ROOT / ".github" / "workflows" / "codeql.yml"


def _codeql_workflow_text() -> str:
    """Return the checked-in CodeQL workflow text."""
    return CODEQL_WORKFLOW_PATH.read_text(encoding="utf-8")


def _pull_request_event_section(workflow_text: str) -> str:
    """Return the top-level pull-request trigger section before permissions."""
    event_marker = "  pull_request:\n"
    assert event_marker in workflow_text, "CodeQL must run on pull-request heads"
    event_tail = workflow_text.split(event_marker, 1)[1]
    return event_tail.split("\npermissions:", 1)[0]


def test_codeql_scans_supported_pull_request_targets() -> None:
    """Require CodeQL evidence for ordinary pull requests to both protected branches."""
    workflow_text = _codeql_workflow_text()
    pull_request_section = _pull_request_event_section(workflow_text)

    assert "    branches:\n" in pull_request_section
    assert "      - develop\n" in pull_request_section
    assert "      - main\n" in pull_request_section
    assert "pull_request_target:" not in workflow_text


def test_codeql_retains_protected_branch_push_reporting() -> None:
    """Require existing protected-branch push reporting alongside pull-request evidence."""
    workflow_text = _codeql_workflow_text()
    push_section = workflow_text.split("  push:\n", 1)[1].split("  pull_request:\n", 1)[0]

    assert "    branches:\n" in push_section
    assert "      - develop\n" in push_section
    assert "      - main\n" in push_section
