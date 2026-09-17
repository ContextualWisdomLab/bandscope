"""Regression contracts for fail-closed npm runtime activation in hosted builds."""

from __future__ import annotations

from pathlib import Path

import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_BUILD_BASELINE = _REPOSITORY_ROOT / ".github" / "workflows" / "build-baseline.yml"
_ACTIVATION_HELPER = _REPOSITORY_ROOT / "scripts" / "checks" / "activate_pinned_npm_runtime.sh"
_ACTIVATION_COMMAND = "bash scripts/checks/activate_pinned_npm_runtime.sh"


def _job_steps(job: object) -> list[dict[str, object]]:
    """Return structurally parsed workflow steps for one job."""
    assert isinstance(job, dict)
    steps = job.get("steps")
    assert isinstance(steps, list)
    parsed: list[dict[str, object]] = []
    for step in steps:
        assert isinstance(step, dict)
        parsed.append(step)
    return parsed


def test_build_baseline_uses_retrying_pinned_npm_activation_before_dependency_reads() -> None:
    """Require every native build lane to acquire the reviewed npm runtime through one helper."""
    document = yaml.safe_load(_BUILD_BASELINE.read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)

    npm_consumers = 0
    for job_name, job in jobs.items():
        steps = _job_steps(job)
        run_steps = [str(step["run"]) for step in steps if isinstance(step.get("run"), str)]
        dependency_index = next(
            (index for index, command in enumerate(run_steps) if command.strip() == "npm ci"),
            None,
        )
        if dependency_index is None:
            continue

        npm_consumers += 1
        activation_indexes = [
            index for index, command in enumerate(run_steps) if command.strip() == _ACTIVATION_COMMAND
        ]
        assert activation_indexes == [dependency_index - 1], f"{job_name} activation ownership"
        assert all("corepack enable npm" not in command for command in run_steps), (
            f"{job_name} must not perform unbounded inline Corepack activation"
        )

    assert npm_consumers == 4


def test_pinned_npm_activation_helper_retries_acquisition_but_never_falls_back() -> None:
    """Keep transient registry recovery bounded while exact npm provenance remains fail closed."""
    source = _ACTIVATION_HELPER.read_text(encoding="utf-8")

    assert 'MAX_ATTEMPTS="3"' in source
    assert 'corepack install --global "$package_manager_spec"' in source
    assert "corepack enable npm" in source
    assert "npm run check:npm-runtime" in source
    assert "sleep_seconds=$((attempt * 5))" in source
    assert "|| true" not in source
    assert "npm@10.9.8" not in source
