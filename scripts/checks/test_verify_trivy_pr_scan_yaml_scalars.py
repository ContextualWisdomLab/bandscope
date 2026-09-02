"""Focused regressions for YAML-equivalent Trivy trigger scalars."""

from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER_PATH = REPO_ROOT / "scripts" / "checks" / "verify_trivy_pr_scan.py"

ESCAPED_BLOCK_LISTS = r'''name: trivy

on:
  pull_request:
    branches:
      - "\u0064evelop"
      - "\u006dain"
    types:
      - "\u006fpened"
      - "\u0073ynchronize"
      - "\u0072eopened"

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
'''

ESCAPED_INLINE_LISTS = r'''name: trivy

on:
  pull_request:
    branches: ["\u0064evelop", "\u006dain"]
    types: ["\u006fpened", "\u0073ynchronize", "\u0072eopened"]

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
'''


def _load_checker():
    spec = importlib.util.spec_from_file_location("verify_trivy_pr_scan", CHECKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load Trivy contract checker")
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    return checker


def main() -> int:
    """Require escaped block and inline YAML lists to preserve contract semantics."""
    checker = _load_checker()
    rejected_cases: list[str] = []
    for case_name, workflow_text in {
        "escaped block lists": ESCAPED_BLOCK_LISTS,
        "escaped inline lists": ESCAPED_INLINE_LISTS,
    }.items():
        with tempfile.TemporaryDirectory() as temp_dir:
            workflow_path = Path(temp_dir) / "trivy.yml"
            workflow_path.write_text(workflow_text, encoding="utf-8")
            checker.TRIVY_WORKFLOW = workflow_path
            if checker.main() != 0:
                rejected_cases.append(case_name)
    if rejected_cases:
        print("Trivy YAML scalar regression:")
        for case_name in rejected_cases:
            print(f"- rejected valid workflow: {case_name}")
        return 1
    print("Trivy YAML scalar regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
