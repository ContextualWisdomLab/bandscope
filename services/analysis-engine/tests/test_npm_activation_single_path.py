"""Keep workflow npm execution on the canonical runtime activation path."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_CANONICAL_ACTIVATION = "bash scripts/checks/activate_pinned_npm_runtime.sh"
_DIRECT_NPM = re.compile(
    r"(?:^|[;&|])\s*"
    r"(?:env\s+(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]+\s+)*)?"
    r"(?:[A-Za-z_][A-Za-z0-9_]*=[^\s;&|]+\s+)*"
    r"(?:command\s+)?npm(?:\s|$)",
    re.MULTILINE,
)


def test_npm_consumers_use_only_the_canonical_activation_helper() -> None:
    """Reject workflow-local Corepack/runtime activation before direct npm execution."""
    workflows_dir = _REPOSITORY_ROOT / ".github" / "workflows"
    workflow_paths = sorted((*workflows_dir.glob("*.yml"), *workflows_dir.glob("*.yaml")))
    assert workflow_paths

    consumers = 0
    for workflow_path in workflow_paths:
        document = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
        assert isinstance(document, dict)
        jobs = document.get("jobs")
        assert isinstance(jobs, dict)

        for job_name, job in jobs.items():
            assert isinstance(job, dict)
            steps = job.get("steps")
            if steps is None:
                continue
            assert isinstance(steps, list)
            run_steps = [
                str(step["run"])
                for step in steps
                if isinstance(step, dict) and isinstance(step.get("run"), str)
            ]
            first_npm_index = next(
                (
                    index
                    for index, command in enumerate(run_steps)
                    if _DIRECT_NPM.search(command)
                ),
                None,
            )
            if first_npm_index is None:
                continue

            consumers += 1
            context = f"{workflow_path.name}:{job_name}"
            helper_indices = [
                index
                for index, command in enumerate(run_steps)
                if command.strip() == _CANONICAL_ACTIVATION
            ]
            assert len(helper_indices) == 1, (
                f"{context} must use exactly one canonical npm activation helper"
            )
            assert helper_indices[0] < first_npm_index, (
                f"{context} must activate the pinned npm runtime before direct npm execution"
            )

            for command in run_steps:
                if command.strip() == _CANONICAL_ACTIVATION:
                    continue
                assert "corepack enable npm" not in command, (
                    f"{context} must not duplicate Corepack activation inline"
                )
                assert "npm run check:npm-runtime" not in command, (
                    f"{context} must not duplicate npm runtime verification inline"
                )

    assert consumers > 0
