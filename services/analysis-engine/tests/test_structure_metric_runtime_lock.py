"""Contract tests for the structure-metric research runtime lock."""

from __future__ import annotations

from pathlib import Path
from types import ModuleType

import pytest
from conftest import load_module

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_LOCK_PATH = (
    _REPOSITORY_ROOT / "services/analysis-engine/requirements-structure-metrics.lock"
)
_EXPECTED_VERSION = "0.8.2"
_EXPECTED_WHEEL_SHA256 = (
    "114cda33d8e17408c170598e0b36ed0d71ff4a2fee8eaf9e165b58ecf1c87170"
)
_EXPECTED_SOURCE_COMMIT = "8db0b3812e2032544c1fc00d02d4256cab043f3d"
_EXPECTED_TRANSPARENCY_ENTRY = 174236906


def _verifier() -> ModuleType:
    """Load the repository-owned structure metric runtime verifier."""
    return load_module(
        "scripts/research/verify_structure_metric_runtime_lock.py",
        "verify_structure_metric_runtime_lock",
    )


def test_runtime_lock_binds_exact_trusted_pypi_wheel(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Research execution must resolve one reviewed mir_eval artifact identity."""
    verifier = _verifier()
    monkeypatch.setattr(
        verifier,
        "_installed_mir_eval_version",
        lambda: _EXPECTED_VERSION,
    )

    identity = verifier.verify_structure_metric_runtime_lock(_LOCK_PATH)

    assert identity.version == _EXPECTED_VERSION
    assert identity.wheel_sha256 == _EXPECTED_WHEEL_SHA256
    assert identity.source_commit == _EXPECTED_SOURCE_COMMIT
    assert identity.pypi_transparency_entry == _EXPECTED_TRANSPARENCY_ENTRY
    assert len(identity.lock_sha256) == 64


def test_runtime_lock_rejects_installed_distribution_drift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A same-API but different mir_eval version is not an admissible runtime."""
    verifier = _verifier()
    monkeypatch.setattr(verifier, "_installed_mir_eval_version", lambda: "0.8.1")

    with pytest.raises(RuntimeError, match="requires mir_eval 0.8.2"):
        verifier.verify_structure_metric_runtime_lock(_LOCK_PATH)


def test_runtime_lock_rejects_artifact_drift(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Changing the wheel hash must invalidate the scientific runtime identity."""
    verifier = _verifier()
    monkeypatch.setattr(
        verifier,
        "_installed_mir_eval_version",
        lambda: _EXPECTED_VERSION,
    )
    drifted = tmp_path / "requirements-structure-metrics.lock"
    lock_text = _LOCK_PATH.read_text(encoding="utf-8")
    drifted.write_text(
        lock_text.replace(_EXPECTED_WHEEL_SHA256, "0" * 64),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="wheel identity"):
        verifier.verify_structure_metric_runtime_lock(drifted)
