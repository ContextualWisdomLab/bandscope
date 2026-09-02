"""Regression tests for Trivy SARIF publication after security findings."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_TRIVY_CONTRACT_CHECKER = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"


def _run_contract_checker(workflow_text: str) -> subprocess.CompletedProcess[str]:
    """Run the repository checker against one isolated workflow fixture."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        temporary_root = Path(temporary_directory)
        workflow_path = temporary_root / ".github" / "workflows" / "trivy.yml"
        workflow_path.parent.mkdir(parents=True)
        workflow_path.write_text(workflow_text, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(_TRIVY_CONTRACT_CHECKER)],
            cwd=temporary_root,
            check=False,
            capture_output=True,
            text=True,
        )


def _workflow_fixture(upload_condition: str, pull_request_comment_spacing: str = "") -> str:
    """Build the minimal fail-on-findings Trivy workflow needed by the checker."""
    comment_suffix = f"{pull_request_comment_spacing}# ordinary PR heads" if pull_request_comment_spacing else ""
    return f"""name: trivy
on:
  push:
    branches: [develop, main]
  pull_request:{comment_suffix}
    branches: [develop, main]
jobs:
  trivy-fs-scan:
    steps:
      - uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
          exit-code: '1'
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        if: {upload_condition}
        with:
          sarif_file: trivy-results.sarif
"""


def test_trivy_checker_accepts_multi_space_inline_mapping_comments() -> None:
    """Valid mapping comments may have more than one separating whitespace character."""
    result = _run_contract_checker(_workflow_fixture("always()", "  "))
    assert result.returncode == 0, result.stdout + result.stderr


def test_trivy_checker_rejects_success_only_upload_after_finding() -> None:
    """A producer that exits 1 for findings must not pair with a success-only uploader."""
    result = _run_contract_checker(_workflow_fixture("success()"))
    assert result.returncode == 1
    assert "uploads after findings" in result.stdout
