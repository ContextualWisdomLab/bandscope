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


def test_primary_ci_proves_exact_npm_before_install_and_lock_reproduction() -> None:
    """Keep the clean installer and lock reproduction on one explicit toolchain."""
    workflow = (_REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

    assert f'node-version: "{_EXPECTED_NODE_VERSION}"' in workflow
    assert f'EXPECTED_NPM_VERSION: "{_EXPECTED_NPM_VERSION}"' in workflow
    assert 'test "$(npm --version)" = "$EXPECTED_NPM_VERSION"' in workflow
    assert "lock-reproduction:" in workflow
    assert "needs: lock-reproduction" in workflow
    assert "npm install --package-lock-only" in workflow
    assert "--ignore-scripts" in workflow
    assert "--no-audit" in workflow
    assert "--no-fund" in workflow
    assert "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" in workflow
    assert (
        "npm-lock-reproduction-${{ github.event.pull_request.head.sha || github.sha }}"
        in workflow
    )
    assert "if-no-files-found: error" in workflow
    assert "git diff --exit-code -- package-lock.json" in workflow


def test_root_lock_uses_the_supported_location_keyed_format() -> None:
    """Require the npm-v9-and-newer lock format used by the pinned generator."""
    lock_document = json.loads((_REPOSITORY_ROOT / "package-lock.json").read_text(encoding="utf-8"))

    assert lock_document["lockfileVersion"] == 3
    assert isinstance(lock_document["packages"], dict)
