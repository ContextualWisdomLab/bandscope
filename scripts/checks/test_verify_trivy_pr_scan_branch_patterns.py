"""Regression coverage for ordered Trivy pull-request branch filters."""

from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"

WORKFLOW_TEMPLATE = """name: trivy

on:
  pull_request:
    branches:
{branch_items}
    types: [opened, synchronize, reopened]

jobs:
  trivy-fs-scan:
    steps:
      - uses: aquasecurity/trivy-action@0123456789abcdef
        with:
          format: sarif
          output: trivy-results.sarif
      - uses: github/codeql-action/upload-sarif@fedcba9876543210
        with:
          sarif_file: trivy-results.sarif
"""


def _load_checker():
    spec = importlib.util.spec_from_file_location("verify_trivy_pr_scan", CHECKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load Trivy contract checker")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    return checker


def _workflow(branch_patterns: list[str]) -> str:
    branch_items = "\n".join(f"      - '{branch_pattern}'" for branch_pattern in branch_patterns)
    return WORKFLOW_TEMPLATE.format(branch_items=branch_items)


def _check(checker, workflow_text: str) -> int:
    with tempfile.TemporaryDirectory() as temp_dir:
        workflow_path = Path(temp_dir) / "trivy.yml"
        workflow_path.write_text(workflow_text, encoding="utf-8")
        checker.TRIVY_WORKFLOW = workflow_path
        return checker.main()


def main() -> int:
    """Prove ordered negative filters cannot hide protected PR heads."""
    checker = _load_checker()
    invalid_cases = {
        "late exact exclusions": ["develop", "main", "!develop", "!main"],
        "late glob exclusion": ["develop", "main", "!m*"],
    }
    valid_cases = {
        "later positive re-inclusion": ["!develop", "!main", "develop", "main"],
        "unrelated exclusion": ["develop", "main", "!release/**"],
    }

    failures: list[str] = []
    for case_name, branch_patterns in invalid_cases.items():
        if _check(checker, _workflow(branch_patterns)) == 0:
            failures.append(f"accepted invalid case: {case_name}")
    for case_name, branch_patterns in valid_cases.items():
        if _check(checker, _workflow(branch_patterns)) != 0:
            failures.append(f"rejected valid case: {case_name}")

    if failures:
        print("Trivy ordered branch-pattern regressions failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Trivy ordered branch-pattern regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
