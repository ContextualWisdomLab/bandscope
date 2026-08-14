"""Supply-chain contracts for a coherent GitHub CodeQL Action revision."""

from __future__ import annotations

import re
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_WORKFLOW_ROOT = _REPOSITORY_ROOT / ".github" / "workflows"
_EXPECTED_CODEQL_ACTION_SHA = "5595ccaf912efad79be6eef63a5619ff05969be3"
_EXPECTED_CODEQL_ACTION_VERSION = "v4.37.6"
_CODEQL_ACTION_REFERENCE = re.compile(
    r"github/codeql-action/(init|autobuild|analyze|upload-sarif)@([0-9a-f]{40})([^\n]*)"
)


def _codeql_action_references() -> list[tuple[Path, str, str, str]]:
    """Return every pinned CodeQL Action reference from checked-in workflows."""
    references: list[tuple[Path, str, str, str]] = []
    for workflow_path in sorted(_WORKFLOW_ROOT.glob("*.y*ml")):
        workflow_text = workflow_path.read_text(encoding="utf-8")
        for action_name, revision_sha, suffix in _CODEQL_ACTION_REFERENCE.findall(workflow_text):
            references.append((workflow_path, action_name, revision_sha, suffix.strip()))
    return references


def test_every_codeql_action_step_uses_the_same_reviewed_revision() -> None:
    """Prevent independently updated phases from creating mixed CodeQL runtimes."""
    references = _codeql_action_references()

    assert references
    assert {revision_sha for _, _, revision_sha, _ in references} == {
        _EXPECTED_CODEQL_ACTION_SHA
    }
    assert all(
        f"# {_EXPECTED_CODEQL_ACTION_VERSION}" in suffix
        for _, _, _, suffix in references
    )


def test_analysis_workflow_keeps_init_autobuild_and_analyze_atomic() -> None:
    """Require the analysis lifecycle to move as one immutable dependency unit."""
    workflow_path = _WORKFLOW_ROOT / "codeql.yml"
    workflow_text = workflow_path.read_text(encoding="utf-8")
    references = {
        action_name: revision_sha
        for action_name, revision_sha, _suffix in _CODEQL_ACTION_REFERENCE.findall(workflow_text)
    }

    assert references == {
        "init": _EXPECTED_CODEQL_ACTION_SHA,
        "autobuild": _EXPECTED_CODEQL_ACTION_SHA,
        "analyze": _EXPECTED_CODEQL_ACTION_SHA,
    }
