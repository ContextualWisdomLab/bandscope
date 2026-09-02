"""Regressions for inline-commented Trivy prerequisite job headers."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TRIVY_CONTRACT_CHECKER = REPO_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"

COMMENTED_PREREQUISITE = """name: trivy

on:
  pull_request:
    branches: [develop, main]

jobs:
  prepare-scan: # shared setup
    if: github.event_name == 'pull_request'
    steps:
      - run: echo prepare
  trivy-fs-scan:
    needs: prepare-scan
    steps:
      - uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

PREFIXED_PREREQUISITE_ONLY = """name: trivy

on:
  pull_request:
    branches: [develop, main]

jobs:
  prepare-scan-extra: # must not satisfy needs: prepare-scan
    if: github.event_name == 'pull_request'
    steps:
      - run: echo prepare
  trivy-fs-scan:
    needs: [prepare-scan]
    steps:
      - uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""


def _run_checker(workflow_text: str) -> subprocess.CompletedProcess[str]:
    """Run the production contract checker against one isolated workflow."""
    with tempfile.TemporaryDirectory() as temporary_directory:
        workflow_path = Path(temporary_directory) / ".github" / "workflows" / "trivy.yml"
        workflow_path.parent.mkdir(parents=True)
        workflow_path.write_text(workflow_text, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(TRIVY_CONTRACT_CHECKER)],
            cwd=temporary_directory,
            capture_output=True,
            check=False,
            text=True,
        )


def main() -> int:
    """Accept an exact commented job key and reject a similarly prefixed key."""
    commented_result = _run_checker(COMMENTED_PREREQUISITE)
    prefixed_result = _run_checker(PREFIXED_PREREQUISITE_ONLY)
    if commented_result.returncode != 0:
        print("Commented prerequisite job header was rejected:")
        print(commented_result.stdout)
        print(commented_result.stderr)
        return 1
    if prefixed_result.returncode == 0:
        print("Similarly prefixed prerequisite job incorrectly satisfied needs")
        return 1
    print("Trivy commented-needs regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
