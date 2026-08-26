"""Regression contract for coordinated CodeQL Action component upgrades."""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CODEQL_WORKFLOW = REPO_ROOT / ".github" / "workflows" / "codeql.yml"
CODEQL_ACTION_PATTERN = re.compile(
    r"github/codeql-action/(?:init|autobuild|analyze)@([0-9a-f]{40})\s+#\s+(v[0-9.]+)"
)


def test_codeql_job_uses_one_action_release() -> None:
    """Require init, autobuild, and analyze to use one reviewed CodeQL release."""
    workflow = CODEQL_WORKFLOW.read_text(encoding="utf-8")
    action_refs = CODEQL_ACTION_PATTERN.findall(workflow)

    assert len(action_refs) == 3
    assert len({sha for sha, _version in action_refs}) == 1
    assert len({version for _sha, version in action_refs}) == 1
