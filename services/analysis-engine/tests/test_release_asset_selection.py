"""Tests for release asset selection and stray-file rejection."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def _write_release_metadata(repo_root: Path) -> None:
    (repo_root / "bandscope-sbom.cdx.json").write_text("{}", encoding="utf-8")
    inventory = repo_root / "supply-chain" / "supplemental-component-inventory.json"
    inventory.parent.mkdir(parents=True)
    inventory.write_text("{}", encoding="utf-8")


def _write_installer(repo_root: Path, platform: str, arch: str, sha: str, suffix: str) -> str:
    artifacts = repo_root / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    archive_name = f"bandscope-{platform}-{arch}-{sha}{suffix}"
    (artifacts / archive_name).write_text(f"{platform}-{arch}", encoding="utf-8")
    (artifacts / f"{archive_name}.sha256").write_text(f"0  {archive_name}\n", encoding="utf-8")
    (artifacts / f"{archive_name}.manifest.txt").write_text(
        f"platform={platform}\narch={arch}\narchive={archive_name}\n",
        encoding="utf-8",
    )
    return archive_name


def test_select_release_assets_returns_only_validated_release_files(tmp_path: Path) -> None:
    """Select installers, sidecars, SBOM, and inventory after validation."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_valid"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    archives = [
        _write_installer(tmp_path, "windows", "amd64", sha, ".exe"),
        _write_installer(tmp_path, "windows", "arm64", sha, ".msi"),
        _write_installer(tmp_path, "macos", "amd64", sha, ".dmg"),
        _write_installer(tmp_path, "macos", "arm64", sha, ".dmg"),
    ]

    assets = selector.select_release_assets(tmp_path, git_sha=sha)

    expected_artifacts = sorted(
        artifact
        for archive in archives
        for artifact in [
            f"artifacts/{archive}",
            f"artifacts/{archive}.manifest.txt",
            f"artifacts/{archive}.sha256",
        ]
    )
    assert assets == [
        *expected_artifacts,
        "bandscope-sbom.cdx.json",
        "supply-chain/supplemental-component-inventory.json",
    ]


def test_select_release_assets_rejects_stray_artifact_file(tmp_path: Path) -> None:
    """Fail closed when an unexpected artifact could otherwise be released."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_stray"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)
    (tmp_path / "artifacts" / "bandscope-windows-amd64-debug.log").write_text(
        "debug", encoding="utf-8"
    )

    with pytest.raises(ValueError, match="unexpected release artifact"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_rejects_symlink_artifact(tmp_path: Path) -> None:
    """Fail closed when a release artifact is a symlink rather than a regular file."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_symlink"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    linked_archive = f"bandscope-windows-amd64-{sha}.exe"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(parents=True)
    symlink_target = tmp_path / "payload.exe"
    symlink_target.write_text("payload", encoding="utf-8")
    (artifacts / linked_archive).symlink_to(symlink_target)
    (artifacts / f"{linked_archive}.sha256").write_text(f"0  {linked_archive}\n", encoding="utf-8")
    (artifacts / f"{linked_archive}.manifest.txt").write_text(
        f"platform=windows\narch=amd64\narchive={linked_archive}\n",
        encoding="utf-8",
    )
    for platform, arch, suffix in [
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    with pytest.raises(ValueError, match="unexpected release artifact path"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_requires_installer_sidecars(tmp_path: Path) -> None:
    """Reject installers missing their checksum or manifest sidecars."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_sidecars"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    archive = _write_installer(tmp_path, "windows", "amd64", sha, ".exe")
    (tmp_path / "artifacts" / f"{archive}.sha256").unlink()
    for platform, arch, suffix in [
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    with pytest.raises(ValueError, match="missing checksum"):
        selector.select_release_assets(tmp_path, git_sha=sha)
