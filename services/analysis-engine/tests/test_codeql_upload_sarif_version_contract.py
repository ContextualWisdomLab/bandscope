"""Regression contracts for CodeQL SARIF uploader provenance comments."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
EXPECTED_SHA = "db488ddef3bf6cb639b32c2e9a7c0a7ea8271d28"
EXPECTED_VERSION = "v4.37.8"
UPLOAD_SARIF_REF = (
    f"github/codeql-action/upload-sarif@{EXPECTED_SHA} # {EXPECTED_VERSION} peeled commit;"
)
WORKFLOWS = (
    REPO_ROOT / ".github" / "workflows" / "ossf-scorecard.yml",
    REPO_ROOT / ".github" / "workflows" / "trivy.yml",
)


def test_upload_sarif_sha_and_version_comment_move_together() -> None:
    """Keep each immutable SARIF uploader pin paired with its reviewed release label."""
    for workflow in WORKFLOWS:
        contents = workflow.read_text(encoding="utf-8")
        assert contents.count(UPLOAD_SARIF_REF) == 1
