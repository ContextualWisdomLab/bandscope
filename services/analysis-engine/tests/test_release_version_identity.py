"""Release identity contracts for the packaged BandScope desktop application."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_identity.py"
_PACKAGER_PATH = _REPOSITORY_ROOT / "scripts" / "release" / "package_desktop_artifact.py"


def _load_guard() -> ModuleType:
    """Load the repository-owned release identity guard from its executable path."""
    assert _GUARD_PATH.is_file(), "release preflight must own a version identity guard"
    guard_module_spec = importlib.util.spec_from_file_location(
        "verify_release_identity", _GUARD_PATH
    )
    assert guard_module_spec is not None and guard_module_spec.loader is not None
    guard_module = importlib.util.module_from_spec(guard_module_spec)
    guard_module_spec.loader.exec_module(guard_module)
    return guard_module


def _write_release_metadata(repository_root: Path, release_version: str) -> None:
    """Write the minimum release metadata consumed by the identity guard."""
    (repository_root / "apps" / "desktop" / "src-tauri").mkdir(parents=True)
    (repository_root / "VERSION").write_text(
        f"{release_version}\n", encoding="utf-8"
    )
    (repository_root / "package.json").write_text(
        json.dumps({"name": "bandscope", "version": release_version}),
        encoding="utf-8",
    )
    (
        repository_root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
    ).write_text(
        json.dumps(
            {
                "productName": "BandScope",
                "version": release_version,
                "identifier": "com.bandscope.desktop",
            }
        ),
        encoding="utf-8",
    )


def test_release_preflight_executes_version_identity_guard() -> None:
    """Keep repository and release preflight fail-closed when versions drift."""
    quickcheck_text = (
        _REPOSITORY_ROOT / "scripts" / "harness" / "quickcheck.sh"
    ).read_text(encoding="utf-8")
    release_workflow_text = (
        _REPOSITORY_ROOT / ".github" / "workflows" / "release.yml"
    ).read_text(encoding="utf-8")

    assert "python3 scripts/checks/verify_release_identity.py" in quickcheck_text
    assert "./scripts/harness/quickcheck.sh" in release_workflow_text


def test_tag_packager_runs_release_preflight_before_artifact_writes() -> None:
    """Prevent the build workflow from publishing around a failed preflight workflow."""
    packager_text = _PACKAGER_PATH.read_text(encoding="utf-8")
    preflight_call = "verify_tag_release_preflight(repo_root)"
    artifact_directory_creation = "output_dir.mkdir(parents=True, exist_ok=True)"

    assert preflight_call in packager_text
    assert artifact_directory_creation in packager_text
    assert packager_text.index(preflight_call) < packager_text.index(
        artifact_directory_creation
    )


def test_repository_release_version_matches_authoritative_version_file() -> None:
    """Verify checked-in projections without creating another version authority."""
    release_guard = _load_guard()
    version_text = (_REPOSITORY_ROOT / "VERSION").read_text(encoding="utf-8")
    assert version_text.endswith("\n")
    expected_version = version_text.removesuffix("\n")
    assert "\n" not in expected_version
    assert (
        release_guard.verify_release_identity(_REPOSITORY_ROOT) == expected_version
    )


def test_release_identity_guard_rejects_metadata_drift(tmp_path: Path) -> None:
    """Reject a package projection that diverges from the authoritative version."""
    release_guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")
    package_document = json.loads(
        (tmp_path / "package.json").read_text(encoding="utf-8")
    )
    package_document["version"] = "1.2.4"
    (tmp_path / "package.json").write_text(
        json.dumps(package_document), encoding="utf-8"
    )

    with pytest.raises(ValueError, match="package.json version does not match VERSION"):
        release_guard.verify_release_identity(tmp_path)


def test_release_identity_guard_rejects_wrong_tag(tmp_path: Path) -> None:
    """Reject a version tag that does not identify the exact VERSION release."""
    release_guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")

    with pytest.raises(ValueError, match="release tag does not match VERSION"):
        release_guard.verify_release_identity(tmp_path, release_tag="v1.2.2")


def test_release_identity_guard_rejects_multiline_version_authority(tmp_path: Path) -> None:
    """Reject an ambiguous VERSION file even if projections repeat the same text."""
    release_guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")
    ambiguous_version = "1.2.3\n2.0.0"
    (tmp_path / "VERSION").write_text(
        f"{ambiguous_version}\n", encoding="utf-8"
    )
    (tmp_path / "package.json").write_text(
        json.dumps({"name": "bandscope", "version": ambiguous_version}),
        encoding="utf-8",
    )
    (tmp_path / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").write_text(
        json.dumps(
            {
                "productName": "BandScope",
                "version": ambiguous_version,
                "identifier": "com.bandscope.desktop",
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(
        ValueError, match="VERSION must contain exactly one non-empty version line"
    ):
        release_guard.verify_release_identity(tmp_path)
