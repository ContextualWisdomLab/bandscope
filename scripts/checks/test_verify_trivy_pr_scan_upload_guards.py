"""Regression coverage for failure-safe Trivy SARIF upload conditions."""

from __future__ import annotations

import importlib.util
from pathlib import Path

CHECKER_PATH = Path(__file__).with_name("verify_trivy_pr_scan.py")
CHECKER_SPEC = importlib.util.spec_from_file_location("verify_trivy_pr_scan", CHECKER_PATH)
if CHECKER_SPEC is None or CHECKER_SPEC.loader is None:
    raise RuntimeError("could not load Trivy PR contract checker")
CHECKER_MODULE = importlib.util.module_from_spec(CHECKER_SPEC)
CHECKER_SPEC.loader.exec_module(CHECKER_MODULE)

FAILURE_SAFE_PR_CONDITIONS = (
    "always() && github.event_name == 'pull_request'",
    'always() && github.event_name == "pull_request"',
    "github.event_name == 'pull_request' && always()",
    'github.event_name == "pull_request" && always()',
)

for upload_condition in FAILURE_SAFE_PR_CONDITIONS:
    assert CHECKER_MODULE._condition_preserves_pull_request_eligibility(upload_condition), upload_condition
    assert CHECKER_MODULE._condition_runs_after_prior_failure(upload_condition), upload_condition

for rejected_condition in (
    "always() && github.event_name == 'push'",
    "github.event_name == 'push' && always()",
    "success() && github.event_name == 'pull_request'",
):
    assert not CHECKER_MODULE._condition_preserves_pull_request_eligibility(rejected_condition), rejected_condition

print("Trivy failure-safe PR upload-condition regressions passed")
