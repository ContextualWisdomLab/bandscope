"""Regression contracts for fail-closed npm runtime activation in hosted builds."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_BUILD_BASELINE = _REPOSITORY_ROOT / ".github" / "workflows" / "build-baseline.yml"
_CI_WORKFLOW = _REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
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


def _write_executable(path: Path, content: str) -> None:
    """Create one executable fake command for helper control-flow tests."""
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def _fake_command_environment(
    tmp_path: Path,
    *,
    acquisition_failures: int,
) -> tuple[dict[str, str], Path, Path, Path, Path]:
    """Return a PATH-isolated command harness and its evidence files."""
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    corepack_count = tmp_path / "corepack-count.txt"
    sleep_log = tmp_path / "sleep.log"
    npm_log = tmp_path / "npm.log"
    corepack_enable_log = tmp_path / "corepack-enable.log"

    _write_executable(
        fake_bin / "node",
        "#!/usr/bin/env bash\ncat >/dev/null\nprintf 'npm@10.9.9'\n",
    )
    _write_executable(
        fake_bin / "corepack",
        """#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "install" ]]; then
  count=0
  if [[ -f "$BANDSCOPE_TEST_COREPACK_COUNT" ]]; then
    count="$(cat "$BANDSCOPE_TEST_COREPACK_COUNT")"
  fi
  count=$((count + 1))
  printf '%s' "$count" > "$BANDSCOPE_TEST_COREPACK_COUNT"
  if (( count <= BANDSCOPE_TEST_ACQUISITION_FAILURES )); then
    echo 'request to registry.npmjs.org failed, reason: connect ETIMEDOUT' >&2
    exit 1
  fi
  exit 0
fi
if [[ "$1" == "enable" ]]; then
  printf 'enable %s\n' "${*:2}" >> "$BANDSCOPE_TEST_COREPACK_ENABLE_LOG"
  exit 0
fi
exit 64
""",
    )
    _write_executable(
        fake_bin / "sleep",
        '#!/usr/bin/env bash\nprintf \'%s\\n\' "$1" >> "$BANDSCOPE_TEST_SLEEP_LOG"\n',
    )
    _write_executable(
        fake_bin / "npm",
        '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "$BANDSCOPE_TEST_NPM_LOG"\n',
    )

    environment = os.environ.copy()
    environment["PATH"] = f"{fake_bin}{os.pathsep}{environment['PATH']}"
    environment["BANDSCOPE_TEST_COREPACK_COUNT"] = str(corepack_count)
    environment["BANDSCOPE_TEST_ACQUISITION_FAILURES"] = str(acquisition_failures)
    environment["BANDSCOPE_TEST_COREPACK_ENABLE_LOG"] = str(corepack_enable_log)
    environment["BANDSCOPE_TEST_SLEEP_LOG"] = str(sleep_log)
    environment["BANDSCOPE_TEST_NPM_LOG"] = str(npm_log)
    return environment, corepack_count, sleep_log, npm_log, corepack_enable_log


def _run_activation_helper(
    tmp_path: Path, *, acquisition_failures: int
) -> tuple[
    subprocess.CompletedProcess[str],
    Path,
    Path,
    Path,
    Path,
]:
    """Execute the real helper against deterministic fake external commands."""
    environment, corepack_count, sleep_log, npm_log, corepack_enable_log = (
        _fake_command_environment(
            tmp_path,
            acquisition_failures=acquisition_failures,
        )
    )
    completed = subprocess.run(
        ["bash", str(_ACTIVATION_HELPER)],
        cwd=tmp_path,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    return completed, corepack_count, sleep_log, npm_log, corepack_enable_log


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
            i for i, command in enumerate(run_steps) if command.strip() == _ACTIVATION_COMMAND
        ]
        assert activation_indexes == [dependency_index - 1], f"{job_name} activation ownership"
        assert all("corepack enable npm" not in command for command in run_steps), (
            f"{job_name} must not perform unbounded inline Corepack activation"
        )

    assert npm_consumers == 4


def test_registered_ci_exact_minimum_node_lane_uses_same_pinned_npm_activation_boundary() -> None:
    """Keep the exact-minimum Node consumer on the canonical npm acquisition helper."""
    document = yaml.safe_load(_CI_WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)
    assert "node-minimum-compatibility" in jobs

    steps = _job_steps(jobs["node-minimum-compatibility"])
    run_steps = [str(step["run"]) for step in steps if isinstance(step.get("run"), str)]
    dependency_index = next(
        index
        for index, command in enumerate(run_steps)
        if command.strip() == "npm ci --ignore-scripts --no-audit --no-fund"
    )
    activation_indexes = [
        index for index, command in enumerate(run_steps) if command.strip() == _ACTIVATION_COMMAND
    ]

    assert activation_indexes == [dependency_index - 1]
    assert all("corepack enable npm" not in command for command in run_steps)
    assert all("npm --version" not in command for command in run_steps)


def test_pinned_npm_activation_helper_retries_acquisition_but_never_falls_back() -> None:
    """Keep admitted timeout recovery bounded while exact npm provenance remains fail closed."""
    source = _ACTIVATION_HELPER.read_text(encoding="utf-8")

    assert 'MAX_ATTEMPTS="3"' in source
    assert 'corepack install --global "$package_manager_spec"' in source
    assert '"ETIMEDOUT"' in source
    assert "not classified as transient" in source
    assert "corepack enable npm" in source
    assert "npm run check:npm-runtime" in source
    assert "sleep_seconds=$((attempt * 5))" in source
    assert "/^npm@[0-9]+\\.[0-9]+\\.[0-9]+$/" in source
    assert "|| true" not in source
    assert "npm@10.9.8" not in source


@pytest.mark.skipif(
    os.name == "nt",
    reason="shell helper is exercised by hosted Windows build lanes",
)
def test_pinned_npm_activation_recovers_after_two_transient_acquisition_failures(
    tmp_path: Path,
) -> None:
    """Retry admitted ETIMEDOUT acquisition, then audit the acquired npm before success."""
    completed, corepack_count, sleep_log, npm_log, corepack_enable_log = _run_activation_helper(
        tmp_path,
        acquisition_failures=2,
    )

    assert completed.returncode == 0, completed.stderr
    assert corepack_count.read_text(encoding="utf-8") == "3"
    assert sleep_log.read_text(encoding="utf-8").splitlines() == ["5", "10"]
    assert npm_log.read_text(encoding="utf-8").splitlines() == ["run check:npm-runtime"]
    assert corepack_enable_log.read_text(encoding="utf-8").splitlines() == ["enable npm"]
    assert "ETIMEDOUT" in completed.stderr
    assert "retrying exact npm@10.9.9" in completed.stderr


@pytest.mark.skipif(
    os.name == "nt",
    reason="shell helper is exercised by hosted Windows build lanes",
)
def test_pinned_npm_activation_fails_closed_after_bounded_timeout_exhaustion(
    tmp_path: Path,
) -> None:
    """Stop after three admitted timeout failures without enabling or invoking fallback npm."""
    completed, corepack_count, sleep_log, npm_log, corepack_enable_log = _run_activation_helper(
        tmp_path,
        acquisition_failures=99,
    )

    assert completed.returncode != 0
    assert corepack_count.read_text(encoding="utf-8") == "3"
    assert sleep_log.read_text(encoding="utf-8").splitlines() == ["5", "10"]
    assert not npm_log.exists()
    assert not corepack_enable_log.exists()
    assert "ETIMEDOUT" in completed.stderr
    assert "after 3 attempts" in completed.stderr
    assert "refusing an unpinned npm fallback" in completed.stderr
