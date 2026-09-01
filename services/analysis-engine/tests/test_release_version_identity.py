"""Release identity contracts for the packaged BandScope desktop application."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_identity.py"
_BUILD_BASELINE_PATH = _REPOSITORY_ROOT / ".github" / "workflows" / "build-baseline.yml"


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


def _workflow_job_block(workflow: str, job_name: str) -> str:
    """Return one top-level GitHub Actions job without requiring a YAML runtime dependency."""
    marker = f"  {job_name}:"
    lines = workflow.splitlines()
    try:
        start = lines.index(marker)
    except ValueError as error:
        raise AssertionError(f"workflow job is missing: {job_name}") from error

    end = len(lines)
    for index in range(start + 1, len(lines)):
        line = lines[index]
        if line.startswith("  ") and not line.startswith("    ") and line.endswith(":"):
            end = index
            break
    return "\n".join(lines[start:end])


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


def test_tag_build_and_publication_depend_on_release_identity_gate() -> None:
    """Block package construction and publication when release identity is invalid."""
    workflow = _BUILD_BASELINE_PATH.read_text(encoding="utf-8")

    identity_job = _workflow_job_block(workflow, "release-identity")
    assert "run: python3 scripts/checks/verify_release_identity.py" in identity_job

    for build_job_name in (
        "build-windows-native",
        "build-windows-arm64",
        "build-macos-native",
        "build-macos-arm64",
    ):
        build_job = _workflow_job_block(workflow, build_job_name)
        assert "needs: release-identity" in build_job

    publisher = _workflow_job_block(workflow, "publish-immutable-release")
    for required_job in ("release-identity", "gate-windows", "gate-macos"):
        assert f"      - {required_job}" in publisher


def test_repository_release_version_matches_authoritative_version_file() -> None:
    """Verify checked-in projections without creating another version authority."""
    guard = _load_guard()
    version_text = (_REPOSITORY_ROOT / "VERSION").read_text(encoding="utf-8")
    assert version_text.endswith("\n")
    expected = version_text.removesuffix("\n")
    assert "\n" not in expected
    assert guard.verify_release_identity(_REPOSITORY_ROOT) == expected


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


def test_release_identity_guard_rejects_multiline_version_authority(tmp_path: Path) -> None:
    """Reject an ambiguous VERSION file even if projections repeat the same text."""
    guard = _load_guard()
    _write_release_metadata(tmp_path, "1.2.3")
    ambiguous = "1.2.3\n2.0.0"
    (tmp_path / "VERSION").write_text(f"{ambiguous}\n", encoding="utf-8")
    (tmp_path / "package.json").write_text(
        json.dumps({"name": "bandscope", "version": ambiguous}), encoding="utf-8"
    )
    (tmp_path / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").write_text(
        json.dumps(
            {
                "productName": "BandScope",
                "version": ambiguous,
                "identifier": "com.bandscope.desktop",
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="VERSION must contain exactly one non-empty version line"):
        guard.verify_release_identity(tmp_path)
