"""Regression checks for the Trivy pull-request workflow contract."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER = REPO_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"

MISSING_PR_TARGETS = """name: trivy

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
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

TARGET_ONLY = """name: trivy

on:
  push:
    branches:
      - develop
      - main
  pull_request_target:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

MIXED_PR_TARGET = """name: trivy

on:
  push:
    branches:
      - develop
      - main
  pull_request:
    branches:
      - develop
      - main
  pull_request_target:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

COMMENTED_MIXED_PR_TARGET = """name: trivy

on:
  push:
    branches:
      - develop
      - main
  pull_request:
    branches:
      - develop
      - main
  pull_request_target: # privileged event must not be hidden by a comment
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

WRONG_PR_TARGETS = """name: trivy

on:
  push:
    branches:
      - develop
      - main
  pull_request:
    branches:
      - develop
      - release

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""

DISCONNECTED_SARIF = """name: trivy

on:
  pull_request:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Unrelated formatter
        run: echo harmless
        with:
          format: sarif
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: table
          output: trivy-results.txt
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: unrelated.sarif
"""

MISMATCHED_SARIF = """name: trivy

on:
  pull_request:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: different-results.sarif
"""

INLINE_COMMENTED_SARIF = """name: trivy

on:
  pull_request:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif # GitHub code scanning format
          output: trivy-results.sarif # produced by Trivy
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif # upload the same result
"""

QUOTED_HASH_SARIF = """name: trivy

on:
  pull_request:
    branches:
      - develop
      - main

jobs:
  trivy-fs-scan:
    steps:
      - name: Run Trivy filesystem scan
        uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: "sarif" # GitHub code scanning format
          output: "trivy#results.sarif" # # inside quotes is data
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: 'trivy#results.sarif' # same path, different YAML quoting
"""

INVALID_CASES = {
    "missing protected PR targets": MISSING_PR_TARGETS,
    "target-only privileged PR event": TARGET_ONLY,
    "mixed pull_request and pull_request_target events": MIXED_PR_TARGET,
    "commented privileged PR event": COMMENTED_MIXED_PR_TARGET,
    "wrong pull_request branch set": WRONG_PR_TARGETS,
    "SARIF format detached from the Trivy action": DISCONNECTED_SARIF,
    "Trivy output and upload paths disagree": MISMATCHED_SARIF,
}

VALID_CASES = {
    "equivalent SARIF paths with inline comments": INLINE_COMMENTED_SARIF,
    "quoted SARIF path containing a literal hash": QUOTED_HASH_SARIF,
}


def _run_checker(workflow: str) -> subprocess.CompletedProcess[str]:
    """Run the production checker against one isolated workflow fixture."""
    with tempfile.TemporaryDirectory() as temp_dir:
        workflow_path = Path(temp_dir) / ".github" / "workflows" / "trivy.yml"
        workflow_path.parent.mkdir(parents=True)
        workflow_path.write_text(workflow, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(CHECKER)],
            cwd=temp_dir,
            capture_output=True,
            check=False,
            text=True,
        )


def main() -> int:
    """Reject unsafe wiring without rejecting valid YAML scalar comments."""
    accepted = [
        name for name, workflow in INVALID_CASES.items() if _run_checker(workflow).returncode == 0
    ]
    rejected = [
        name for name, workflow in VALID_CASES.items() if _run_checker(workflow).returncode != 0
    ]

    if accepted or rejected:
        print("Trivy PR contract regression:")
        for name in accepted:
            print(f"- accepted malformed workflow: {name}")
        for name in rejected:
            print(f"- rejected valid workflow: {name}")
        return 1
    print("Trivy PR contract regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
