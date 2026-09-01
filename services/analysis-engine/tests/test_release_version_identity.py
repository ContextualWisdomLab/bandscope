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


def _workflow_job_block(workflow_text: str, job_name: str) -> str:
    """Return one top-level GitHub Actions job without requiring a YAML runtime dependency."""
    job_marker = f"  {job_name}:"
    workflow_lines = workflow_text.splitlines()
    try:
        job_start_index = workflow_lines.index(job_marker)
    except ValueError as lookup_error:
        raise AssertionError(f"workflow job is missing: {job_name}") from lookup_error

    job_end_index = len(workflow_lines)
    for line_index in range(job_start_index + 1, len(workflow_lines)):
        workflow_line = workflow_lines[line_index]
        if (
            workflow_line.startswith("  ")
            and not workflow_line.startswith("    ")
            and workflow_line.endswith(":")
        ):
            job_end_index = line_index
            break
    return "\n".join(workflow_lines[job_start_index:job_end_index])


def test_release_preflight_executes_version_identity_guard() -> None:
    """Keep release preflight fail-closed when version projections drift."""
    quickcheck_text = (
        _REPOSITORY_ROOT / "scripts" / "harness" / "quickcheck.sh"
    ).read_text(encoding="utf-8")
    release_workflow_text = (
        _REPOSITORY_ROOT / ".github" / "workflows" / "release.yml"
    ).read_text(encoding="utf-8")

    assert "python3 scripts/checks/verify_release_identity.py" in quickcheck_text
    assert "./scripts/harness/quickcheck.sh" in release_workflow_text


def test_tag_build_and_publication_depend_on_release_identity_gate() -> None:
    """Block package construction and publication when release identity is invalid."""
    build_workflow_text = _BUILD_BASELINE_PATH.read_text(encoding="utf-8")

    identity_job = _workflow_job_block(build_workflow_text, "release-identity")
    assert "run: python3 scripts/checks/verify_release_identity.py" in identity_job

    for build_job_name in (
        "build-windows-native",
        "build-windows-arm64",
        "build-macos-native",
        "build-macos-arm64",
    ):
        build_job = _workflow_job_block(build_workflow_text, build_job_name)
        assert "needs: release-identity" in build_job

    publication_job = _workflow_job_block(
        build_workflow_text, "publish-immutable-release"
    )
    for required_job_name in ("release-identity", "gate-windows", "gate-macos"):
        assert f"      - {required_job_name}" in publication_job


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
