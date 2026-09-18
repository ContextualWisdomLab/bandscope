"""Regression tests for canonical structure-experiment execution admission."""

from __future__ import annotations

from types import ModuleType

import pytest
from conftest import load_module
from test_structure_noninferiority_policy import _registration


def _runner() -> ModuleType:
    """Load the repository-owned end-to-end scientific execution boundary."""
    return load_module(
        "scripts/research/run_structure_noninferiority_experiment.py",
        "run_structure_noninferiority_experiment_contract",
    )


def _synthetic_host_profile(runner: ModuleType, *, cpu_model: str) -> object:
    """Return deterministic unit-test host evidence without probing the CI machine."""
    return runner.StructureHostProfile(
        contract_id=runner.HOST_PROFILE_CONTRACT_ID,
        platform="darwin",
        os_release="25.6.0",
        os_version="Darwin Kernel Version 25.6.0",
        machine="arm64",
        hardware_model="Mac16,8",
        cpu_model=cpu_model,
        logical_cpu_count=12,
    )


def test_execution_rejects_registered_host_profile_drift_before_corpus_admission() -> None:
    """Latency evidence cannot claim a preregistered host while running elsewhere."""
    runner = _runner()
    registration = _registration()
    observed = _synthetic_host_profile(runner, cpu_model="Apple M4 Pro")
    expected = _synthetic_host_profile(runner, cpu_model="Apple M3 Pro")
    runtime = registration["runtime"]
    assert isinstance(runtime, dict)
    runtime["host_profile"] = runner.host_profile_identity(expected)
    admitted = False

    def forbidden_admission(*args: object, **kwargs: object) -> object:
        nonlocal admitted
        admitted = True
        raise AssertionError("corpus admission must not run after host-profile drift")

    with pytest.raises(ValueError, match="runtime.host_profile"):
        runner.execute_registered_experiment(
            registration,
            {"schema_version": 1, "registration_sha256": "unused", "tracks": []},
            runtime_identity={
                "source_commit": "e" * 40,
                "uv_lock_sha256": "f" * 64,
                "python_version": "3.12.11",
                "librosa_version": "0.11.0",
                "numpy_version": "2.3.3",
            },
            host_profile=observed,
            corpus_admitter=forbidden_admission,
        )

    assert admitted is False


def test_host_profile_identity_is_content_addressed_and_excludes_machine_name() -> None:
    """Scientific host identity uses hardware/OS facts, not hostname or user identity."""
    runner = _runner()
    left = _synthetic_host_profile(runner, cpu_model="Apple M4 Pro")
    right = _synthetic_host_profile(runner, cpu_model="Apple M4 Pro")
    changed = _synthetic_host_profile(runner, cpu_model="Apple M4 Max")

    assert runner.host_profile_identity(left) == runner.host_profile_identity(right)
    assert runner.host_profile_identity(left) != runner.host_profile_identity(changed)
    payload = runner.host_profile_payload(left)
    assert set(payload) == {
        "contract_id",
        "platform",
        "os_release",
        "os_version",
        "machine",
        "hardware_model",
        "cpu_model",
        "logical_cpu_count",
    }
    assert "hostname" not in payload
    assert "node" not in payload
    assert "user" not in payload
