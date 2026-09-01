"""Release identity contracts for the packaged BandScope desktop application."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest
import yaml

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


def _workflow_needs(job: dict[str, object]) -> set[str]:
    """Normalize a workflow job's ``needs`` dependency to a set of job IDs."""
    needs = job.get("needs", [])
    if isinstance(needs, str):
        return {needs}
    assert isinstance(needs, list)
    assert all(isinstance(item, str) for item in needs)
    return set(needs)


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
    document = yaml.safe_load(_BUILD_BASELINE_PATH.read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    jobs = document.get("jobs")
    assert isinstance(jobs, dict)

    identity_job = jobs.get("release-identity")
    assert isinstance(identity_job, dict)
    steps = identity_job.get("steps")
    assert isinstance(steps, list)
    assert any(
        isinstance(step, dict)
        and step.get("run") == "python3 scripts/checks/verify_release_identity.py"
        for step in steps
    )

    for build_job_name in (
        "build-windows-native",
        "build-windows-arm64",
        "build-macos-native",
        "build-macos-arm64",
    ):
        build_job = jobs.get(build_job_name)
        assert isinstance(build_job, dict)
        assert "release-identity" in _workflow_needs(build_job)

    publisher = jobs.get("publish-immutable-release")
    assert isinstance(publisher, dict)
    assert {"release-identity", "gate-windows", "gate-macos"} <= _workflow_needs(
        publisher
    )


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
