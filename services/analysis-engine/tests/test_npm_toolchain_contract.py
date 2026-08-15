"""Contracts for deterministic npm lockfile generation and CI provenance."""

from __future__ import annotations

import json
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_EXPECTED_NPM_VERSION = "10.9.8"
_EXPECTED_NODE_VERSION = "22.22.3"


def _root_manifest() -> dict[str, object]:
    """Return the checked-in root package manifest as a JSON object."""
    manifest = json.loads((_REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8"))
    assert isinstance(manifest, dict)
    return manifest


def _primary_ci_workflow() -> str:
    """Return the primary CI workflow as source text."""
    return (_REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")


def _lock_validation_job(workflow: str) -> str:
    """Return only the frozen npm lock-validation job from the CI workflow."""
    start = workflow.index("  lock-validation:")
    end = workflow.index("\n  verify:", start)
    return workflow[start:end]


def test_root_manifest_pins_the_lockfile_generator_and_fails_on_drift() -> None:
    """Require npm and source-tree commands to reject a different generator."""
    manifest = _root_manifest()

    assert manifest["packageManager"] == f"npm@{_EXPECTED_NPM_VERSION}"
    assert manifest["engines"] == {"node": ">=22.13 <23"}
    assert manifest["devEngines"] == {
        "packageManager": {
            "name": "npm",
            "version": _EXPECTED_NPM_VERSION,
            "onFail": "error",
        }
    }


def test_primary_ci_consumes_the_lock_without_mutable_resolution() -> None:
    """Keep lock validation frozen while retaining exact Node and npm provenance."""
    workflow = _primary_ci_workflow()
    lock_job = _lock_validation_job(workflow)

    assert f'node-version: "{_EXPECTED_NODE_VERSION}"' in workflow
    assert f'EXPECTED_NPM_VERSION: "{_EXPECTED_NPM_VERSION}"' in workflow
    assert 'test "$(npm --version)" = "$EXPECTED_NPM_VERSION"' in lock_job
    assert "npm ci --ignore-scripts --no-audit --no-fund" in lock_job
    assert "git diff --exit-code -- package.json package-lock.json" in lock_job
    assert "needs: lock-validation" in workflow
    assert "npm install " not in lock_job
    assert "npm update " not in lock_job
    assert "npx " not in lock_job


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
