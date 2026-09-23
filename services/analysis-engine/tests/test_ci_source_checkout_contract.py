"""Contracts for exact source identity in the generic pull-request CI workflow."""

from __future__ import annotations

from pathlib import Path

import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_EXACT_SOURCE_REF = "${{ github.event.pull_request.head.sha || github.sha }}"


def test_generic_ci_checkouts_bind_the_exact_pull_request_source_head() -> None:
    """Reject synthetic pull-request merge refs as generic CI source evidence."""
    workflow_path = _REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
    workflow = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
    assert isinstance(workflow, dict)
    jobs = workflow.get("jobs")
    assert isinstance(jobs, dict)

    expected_jobs = {"lock-validation", "verify", "rust-check"}
    assert expected_jobs <= jobs.keys()

    for job_name in sorted(expected_jobs):
        job = jobs[job_name]
        assert isinstance(job, dict)
        steps = job.get("steps")
        assert isinstance(steps, list)
        checkout_steps = [
            step
            for step in steps
            if isinstance(step, dict)
            and isinstance(step.get("uses"), str)
            and str(step["uses"]).startswith("actions/checkout@")
        ]
        assert len(checkout_steps) == 1, f"{job_name} must own one checkout step"
        checkout_options = checkout_steps[0].get("with")
        assert isinstance(checkout_options, dict)
        assert checkout_options.get("persist-credentials") is False
        assert checkout_options.get("ref") == _EXACT_SOURCE_REF
