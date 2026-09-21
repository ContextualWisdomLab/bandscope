"""Contracts for deterministic npm lockfile generation and CI provenance."""

from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_EXPECTED_NPM_VERSION = "10.9.9"
_EXPECTED_NPM_INTEGRITY = (
    "d60fba8cb42f688b81e33c2f1cbef2ad7b977166700ec0ad057f1b6d60ea6ef"
    "2524abf673e20c35931cd8305d1dbb8887134d6eefdc0e7b8435bd458bf65b862"
)
_EXPECTED_PACKAGE_MANAGER = (
    f"npm@{_EXPECTED_NPM_VERSION}+sha512.{_EXPECTED_NPM_INTEGRITY}"
)
_EXPECTED_NODE_VERSION = "22.22.3"
_MINIMUM_NPM_TAR_VERSION = "7.5.19"
_NPM_RUNTIME_CHECK = "node scripts/checks/verify_npm_runtime.mjs"
_NPM_ACTIVATION_COMMAND = "bash scripts/checks/activate_pinned_npm_runtime.sh"


def _root_manifest() -> dict[str, object]:
    """Return the checked-in root package manifest as a JSON object."""
    manifest = json.loads((_REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8"))
    assert isinstance(manifest, dict)
    return manifest


def _primary_ci_workflow() -> str:
    """Return the primary CI workflow as source text."""
    return (_REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")


def _primary_ci_jobs(workflow: str) -> dict[str, object]:
    """Parse and return the primary CI job mapping for structural assertions."""
    document = yaml.safe_load(workflow)
    assert isinstance(document, dict)
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)
    return jobs


def _job_steps(jobs: dict[str, object], job_name: str) -> list[dict[str, object]]:
    """Return one CI job's structurally parsed step mappings."""
    job = jobs.get(job_name)
    assert isinstance(job, dict)
    steps = job.get("steps")
    assert isinstance(steps, list)

    parsed_steps: list[dict[str, object]] = []
    for step in steps:
        assert isinstance(step, dict)
        parsed_steps.append(step)
    return parsed_steps


def _lock_validation_job(workflow: str) -> str:
    """Return only the frozen npm lock-validation job from the CI workflow."""
    start = workflow.index("  lock-validation:")
    end = workflow.index("\n  verify:", start)
    return workflow[start:end]


def _assert_checkout_credentials_not_persisted(steps: list[dict[str, object]]) -> None:
    """Require the owning checkout step itself to disable credential persistence."""
    checkout_steps = [
        step
        for step in steps
        if isinstance(step.get("uses"), str) and str(step["uses"]).startswith("actions/checkout@")
    ]
    assert len(checkout_steps) == 1
    checkout_options = checkout_steps[0].get("with")
    assert isinstance(checkout_options, dict)
    assert checkout_options.get("persist-credentials") is False


def _assert_no_mutable_npm_commands(steps: list[dict[str, object]]) -> None:
    """Reject mutable npm/npx commands at executable shell-command boundaries."""
    mutable_npm = re.compile(r"(?:^|[;&|]\s*)npm\s+(?:install|update)(?:\s|$)")
    mutable_npx = re.compile(r"(?:^|[;&|]\s*)npx(?:\s|$)")

    for step in steps:
        run = step.get("run")
        if not isinstance(run, str):
            continue
        for line in run.splitlines():
            command = line.strip()
            assert mutable_npm.search(command) is None
            assert mutable_npx.search(command) is None


def _assert_patched_npm_precedes_dependency_consumption(steps: list[dict[str, object]]) -> None:
    """Require reviewed npm activation and audit before the first npm dependency read."""
    run_steps = [str(step["run"]) for step in steps if isinstance(step.get("run"), str)]
    consumption_index = next(
        (
            index
            for index, command in enumerate(run_steps)
            if re.search(r"(?:^|\n)\s*npm ci(?:\s|$)", command)
        ),
        None,
    )
    assert consumption_index is not None

    helper_index = next(
        (
            index
            for index, command in enumerate(run_steps)
            if command.strip() == _NPM_ACTIVATION_COMMAND
        ),
        None,
    )
    if helper_index is not None:
        assert helper_index < consumption_index
        return

    activation_index = next(
        (index for index, command in enumerate(run_steps) if "corepack enable npm" in command),
        None,
    )
    audit_index = next(
        (
            index
            for index, command in enumerate(run_steps)
            if "npm run check:npm-runtime" in command
        ),
        None,
    )
    assert activation_index is not None
    assert audit_index is not None
    assert activation_index <= audit_index < consumption_index


def test_root_manifest_pins_the_lockfile_generator_and_fails_on_drift() -> None:
    """Require npm and source-tree commands to reject a different generator."""
    manifest = _root_manifest()

    assert manifest["packageManager"] == _EXPECTED_PACKAGE_MANAGER
    assert manifest["engines"] == {"node": ">=22.22.2 <23"}
    assert manifest["devEngines"] == {
        "packageManager": {
            "name": "npm",
            "version": _EXPECTED_NPM_VERSION,
            "onFail": "error",
        }
    }
    scripts = manifest.get("scripts")
    assert isinstance(scripts, dict)
    assert scripts.get("check:npm-runtime") == _NPM_RUNTIME_CHECK

    runtime_check = (_REPOSITORY_ROOT / "scripts" / "checks" / "verify_npm_runtime.mjs").read_text(
        encoding="utf-8"
    )
    assert f'EXPECTED_NPM_VERSION = "{_EXPECTED_NPM_VERSION}"' in runtime_check
    assert f'MINIMUM_TAR_VERSION = "{_MINIMUM_NPM_TAR_VERSION}"' in runtime_check


def test_primary_ci_consumes_the_lock_without_mutable_resolution() -> None:
    """Keep lock validation frozen while retaining exact Node and npm provenance."""
    workflow = _primary_ci_workflow()
    jobs = _primary_ci_jobs(workflow)
    lock_steps = _job_steps(jobs, "lock-validation")
    lock_job = _lock_validation_job(workflow)

    assert f'node-version: "{_EXPECTED_NODE_VERSION}"' in workflow
    assert lock_job.count(_NPM_ACTIVATION_COMMAND) == 1
    assert "npm ci --ignore-scripts --no-audit --no-fund" in lock_job
    assert "git diff --exit-code -- package.json package-lock.json" in lock_job
    assert "needs: lock-validation" in workflow

    for job_name in ("lock-validation", "verify", "rust-check"):
        job_steps = _job_steps(jobs, job_name)
        _assert_checkout_credentials_not_persisted(job_steps)
        _assert_patched_npm_precedes_dependency_consumption(job_steps)
    _assert_no_mutable_npm_commands(lock_steps)


def test_root_lock_uses_the_supported_location_keyed_format() -> None:
    """Require the npm-v9-and-newer lock format used by the pinned generator."""
    lock_document = json.loads((_REPOSITORY_ROOT / "package-lock.json").read_text(encoding="utf-8"))

    assert lock_document["lockfileVersion"] == 3
    assert isinstance(lock_document["packages"], dict)


def test_public_registry_lock_entries_have_integrity_evidence() -> None:
    """Require SRI for every public npm-registry artifact recorded in the root lock."""
    lock_document = json.loads((_REPOSITORY_ROOT / "package-lock.json").read_text(encoding="utf-8"))
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    for location, package_record in packages.items():
        assert isinstance(location, str)
        assert isinstance(package_record, dict)
        resolved = package_record.get("resolved")
        if not isinstance(resolved, str):
            continue
        if not (
            resolved == "registry.npmjs.org"
            or resolved.startswith("registry.npmjs.org/")
            or resolved.startswith("https://registry.npmjs.org/")
        ):
            continue
        integrity = package_record.get("integrity")
        assert isinstance(integrity, str), f"missing integrity for {location}"
        supported_algorithm = integrity.startswith(("sha512-", "sha1-"))
        assert supported_algorithm, f"unsupported integrity for {location}"


def test_root_lock_preserves_esbuild_peer_metadata() -> None:
    """Reject serializer drift that strips the root @esbuild peer markers."""
    lock_document = json.loads((_REPOSITORY_ROOT / "package-lock.json").read_text(encoding="utf-8"))
    packages = lock_document["packages"]
    assert isinstance(packages, dict)

    esbuild_records = {
        location: package_record
        for location, package_record in packages.items()
        if isinstance(location, str) and location.startswith("node_modules/@esbuild/")
    }
    assert esbuild_records, "root lock must contain @esbuild platform packages"

    for location, package_record in esbuild_records.items():
        assert isinstance(package_record, dict)
        assert package_record.get("peer") is True, f"missing peer metadata for {location}"


def test_npm_consuming_workflows_activate_pinned_runtime_before_dependency_reads() -> None:
    """Discover every npm consumer and require the canonical runtime before dependency reads."""
    workflows_dir = _REPOSITORY_ROOT / ".github" / "workflows"
    workflow_paths = sorted((*workflows_dir.glob("*.yml"), *workflows_dir.glob("*.yaml")))
    assert workflow_paths, "repository must contain GitHub Actions workflows"

    npm_consumer_workflows = 0
    npm_consumer_jobs = 0
    for workflow_path in workflow_paths:
        document = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
        assert isinstance(document, dict)
        jobs = document.get("jobs")
        assert isinstance(jobs, dict)
        workflow_consumers = 0

        for job_name, job in jobs.items():
            assert isinstance(job, dict)
            if job.get("steps") is None:
                # Reusable-workflow call jobs have no local shell steps. Their called workflow
                # is scanned independently when it lives in this repository workflow directory.
                continue
            steps = _job_steps(jobs, str(job_name))
            consumes_npm = any(
                isinstance(step.get("run"), str)
                and re.search(r"(?:^|\n)\s*npm ci(?:\s|$)", str(step["run"]))
                for step in steps
            )
            if not consumes_npm:
                continue
            workflow_consumers += 1
            npm_consumer_jobs += 1
            _assert_checkout_credentials_not_persisted(steps)

            setup_node_steps = [
                step
                for step in steps
                if isinstance(step.get("uses"), str)
                and str(step["uses"]).startswith("actions/setup-node@")
            ]
            context = f"{workflow_path.name}:{job_name}"
            assert len(setup_node_steps) == 1, f"{context} setup-node ownership"
            setup_options = setup_node_steps[0].get("with")
            assert isinstance(setup_options, dict)
            assert "cache" not in setup_options, f"{context} pre-Corepack npm cache"
            assert setup_options.get("package-manager-cache") is False, (
                f"{context} must disable setup-node package-manager cache"
            )
            _assert_patched_npm_precedes_dependency_consumption(steps)

        if workflow_consumers:
            npm_consumer_workflows += 1

    assert npm_consumer_workflows > 0, "repository must contain an npm-consuming workflow"
    assert npm_consumer_jobs > 0, "repository must contain an npm-consuming workflow job"
