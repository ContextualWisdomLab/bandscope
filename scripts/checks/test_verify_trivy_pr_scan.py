"""Regression checks for the Trivy pull-request workflow contract."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER = REPO_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"

MALFORMED_WORKFLOW = """name: trivy

on:
  push:
    branches:
      - develop
      - main
  pull_request:
    types: [opened]

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        with:
          format: sarif
      - uses: github/codeql-action/upload-sarif@0123456789abcdef
"""


def main() -> int:
    """Reject a PR trigger that borrows protected-branch names from push."""
    with tempfile.TemporaryDirectory() as temp_dir:
        workflow_path = Path(temp_dir) / ".github" / "workflows" / "trivy.yml"
        workflow_path.parent.mkdir(parents=True)
        workflow_path.write_text(MALFORMED_WORKFLOW, encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(CHECKER)],
            cwd=temp_dir,
            capture_output=True,
            check=False,
            text=True,
        )

    if result.returncode == 0:
        print(
            "Trivy PR contract regression: checker accepted pull_request without "
            "develop/main branch targets"
        )
        return 1
    print("Trivy PR contract regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
