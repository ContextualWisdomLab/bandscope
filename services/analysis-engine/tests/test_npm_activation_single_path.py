"""Keep npm-consuming workflows on the canonical runtime activation path."""

from __future__ import annotations

import re
from pathlib import Path

import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_CANONICAL_ACTIVATION = "bash scripts/checks/activate_pinned_npm_runtime.sh"
_NPM_CI = re.compile(r"(?:^|\n)\s*npm ci(?:\s|$)")


def test_npm_consumers_use_only_the_canonical_activation_helper() -> None:
    """Reject workflow-local Corepack/runtime activation before npm dependency reads."""
    workflow_paths = sorted(
        (*(_REPOSITORY_ROOT / ".github" / "workflows").glob("*.yml"),)
        + (*(_REPOSITORY_ROOT / ".github" / "workflows").glob("*.yaml"),)
    )
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
            consumption_index = next(
                (
                    index
                    for index, command in enumerate(run_steps)
                    if _NPM_CI.search(command)
                ),
                None,
            )
            if consumption_index is None:
                continue

            consumers += 1
            context = f"{workflow_path.name}:{job_name}"
            helper_indices = [
                index
                for index, command in enumerate(run_steps)
                if command.strip() == _CANONICAL_ACTIVATION
            ]
            assert helper_indices == [helper_indices[0]] if helper_indices else False, (
                f"{context} must use exactly one canonical npm activation helper"
            )
            assert helper_indices[0] < consumption_index, (
                f"{context} must activate the pinned npm runtime before npm ci"
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
