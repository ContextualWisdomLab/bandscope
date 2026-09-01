"""Release identity contracts for the packaged BandScope desktop application."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_identity.py"


def _load_guard() -> ModuleType:
    """Load the repository-owned release identity guard from its executable path."""
    assert _GUARD_PATH.is_file(), "release preflight must own a version identity guard"
    spec = importlib.util.spec_from_file_location("verify_release_identity", _GUARD_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _write_release_metadata(root: Path, version: str) -> None:
    """Write the minimum release metadata consumed by the identity guard."""
    (root / "apps" / "desktop" / "src-tauri").mkdir(parents=True)
    (root / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    (root / "package.json").write_text(
        json.dumps({"name": "bandscope", "version": version}), encoding="utf-8"
    )
    (root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").write_text(
        json.dumps(
            {
                "productName": "BandScope",
                "version": version,
                "identifier": "com.bandscope.desktop",
            }
        ),
        encoding="utf-8",
    )


def test_release_preflight_executes_version_identity_guard() -> None:
    """Keep release preflight fail-closed when version projections drift."""
    quickcheck = (_REPOSITORY_ROOT / "scripts" / "harness" / "quickcheck.sh").read_text(
        encoding="utf-8"
    )
    release_workflow = (
        _REPOSITORY_ROOT / ".github" / "workflows" / "release.yml"
    ).read_text(encoding="utf-8")

    assert "python3 scripts/checks/verify_release_identity.py" in quickcheck
    assert "./scripts/harness/quickcheck.sh" in release_workflow


def test_repository_release_version_matches_authoritative_version_file() -> None:
    """Verify the checked-in package and Tauri release versions against VERSION."""
    guard = _load_guard()
    assert guard.verify_release_identity(_REPOSITORY_ROOT) == "0.1.3"


def test_release_identity_guard_rejects_metadata_drift(tmp_path: Path) -> None:
    """Reject a package projection that diverges from the authoritative version."""
    guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")
    package = json.loads((tmp_path / "package.json").read_text(encoding="utf-8"))
    package["version"] = "1.2.4"
    (tmp_path / "package.json").write_text(json.dumps(package), encoding="utf-8")

    with pytest.raises(ValueError, match="package.json version does not match VERSION"):
        guard.verify_release_identity(tmp_path)


def test_release_identity_guard_rejects_wrong_tag(tmp_path: Path) -> None:
    """Reject a version tag that does not identify the exact VERSION release."""
    guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")

    with pytest.raises(ValueError, match="release tag does not match VERSION"):
        guard.verify_release_identity(tmp_path, release_tag="v1.2.2")
