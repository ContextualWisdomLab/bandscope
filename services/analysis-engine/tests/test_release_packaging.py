"""Tests for desktop release packaging helpers and artifact metadata."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module


def test_release_packaging_includes_architecture_in_artifact_identity(
    monkeypatch,
) -> None:
    """Ensure artifact names encode the selected platform and architecture."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact"
    )

    monkeypatch.setenv("GITHUB_SHA", "abcdef1234567890")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", "windows")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", "arm64")

    artifact = packaging.artifact_identity("installer.exe")

    assert artifact == {
        "platform": "windows",
        "arch": "arm64",
        "archive_name": "bandscope-windows-arm64-abcdef123456.exe",
        "manifest_name": "bandscope-windows-arm64-abcdef123456.exe.manifest.txt",
    }


def test_release_packaging_derives_artifact_identity_from_target_triple(
    monkeypatch,
) -> None:
    """Ensure target triples drive archive naming when explicit artifact env vars are absent."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py",
        "package_desktop_artifact_identity_target",
    )

    monkeypatch.setenv("GITHUB_SHA", "fedcba9876543210")
    monkeypatch.delenv("BANDSCOPE_ARTIFACT_OS", raising=False)
    monkeypatch.delenv("BANDSCOPE_ARTIFACT_ARCH", raising=False)
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "x86_64-pc-windows-msvc")
    monkeypatch.setattr(packaging.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(packaging.platform, "machine", lambda: "arm64")

    artifact = packaging.artifact_identity("installer.exe")

    assert artifact == {
        "platform": "windows",
        "arch": "amd64",
        "archive_name": "bandscope-windows-amd64-fedcba987654.exe",
        "manifest_name": "bandscope-windows-amd64-fedcba987654.exe.manifest.txt",
    }


def test_find_installer_packages_returns_dmg(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure find_installer_packages finds dmg files."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_target"
    )

    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "aarch64-apple-darwin")
    dmg_path = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "aarch64-apple-darwin"
        / "release"
        / "bundle"
        / "dmg"
        / "Test.dmg"
    )
    dmg_path.parent.mkdir(parents=True)
    dmg_path.write_bytes(b"dmg")

    installers = packaging.find_installer_packages(tmp_path)
    assert installers == [dmg_path]


def test_find_installer_packages_returns_exe_and_msi(monkeypatch, tmp_path: Path) -> None:
    """Ensure find_installer_packages finds exe and msi files."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_windows_target"
    )

    monkeypatch.delenv("BANDSCOPE_ARTIFACT_OS", raising=False)
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "x86_64-pc-windows-msvc")
    monkeypatch.setattr(packaging.platform, "system", lambda: "Darwin")

    exe_path = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "x86_64-pc-windows-msvc"
        / "release"
        / "bundle"
        / "nsis"
        / "Test.exe"
    )
    msi_path = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "x86_64-pc-windows-msvc"
        / "release"
        / "bundle"
        / "msi"
        / "Test.msi"
    )
    exe_path.parent.mkdir(parents=True)
    exe_path.write_bytes(b"exe")
    msi_path.parent.mkdir(parents=True)
    msi_path.write_bytes(b"msi")

    installers = packaging.find_installer_packages(tmp_path)
    assert set(installers) == {exe_path, msi_path}


def test_find_installer_packages_ignores_unexpected_nested_executables(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure installer discovery is limited to Tauri's expected bundle folders."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_nested"
    )

    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "x86_64-pc-windows-msvc")
    expected_path = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "x86_64-pc-windows-msvc"
        / "release"
        / "bundle"
        / "nsis"
        / "Installer.exe"
    )
    stray_path = expected_path.parents[1] / "tools" / "helper.exe"
    expected_path.parent.mkdir(parents=True)
    expected_path.write_bytes(b"installer")
    stray_path.parent.mkdir(parents=True)
    stray_path.write_bytes(b"helper")

    assert packaging.find_installer_packages(tmp_path) == [expected_path]


def test_release_packaging_main_keeps_same_extension_installers_unique(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure duplicate installer extensions do not overwrite each other."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_duplicate_ext"
    )
    repo_root = tmp_path / "repo"
    script_path = repo_root / "scripts" / "release" / "package_desktop_artifact.py"
    script_path.parent.mkdir(parents=True)
    script_path.write_text("# placeholder", encoding="utf-8")

    nsis_path = (
        repo_root
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "x86_64-pc-windows-msvc"
        / "release"
        / "bundle"
        / "nsis"
    )
    first_path = nsis_path / "Setup.exe"
    second_path = nsis_path / "Setup-Web.exe"
    nsis_path.mkdir(parents=True)
    first_path.write_bytes(b"first")
    second_path.write_bytes(b"second")

    monkeypatch.setattr(packaging, "__file__", str(script_path))
    monkeypatch.setenv("GITHUB_SHA", "abcdef1234567890")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", "windows")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", "amd64")
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "x86_64-pc-windows-msvc")

    assert packaging.main() == 0

    archives = sorted((repo_root / "artifacts").glob("*.exe"))
    assert [archive.name for archive in archives] == [
        "bandscope-windows-amd64-abcdef123456-Setup-Web.exe",
        "bandscope-windows-amd64-abcdef123456-Setup.exe",
    ]
    assert archives[0].read_bytes() == b"second"
    assert archives[1].read_bytes() == b"first"


def test_release_packaging_maps_darwin_to_macos(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure Darwin hosts map to the repository's canonical macOS label."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_platform"
    )

    monkeypatch.delenv("BANDSCOPE_ARTIFACT_OS", raising=False)
    monkeypatch.setattr(packaging.platform, "system", lambda: "Darwin")

    assert packaging.normalized_platform() == "macos"


def test_release_packaging_main_writes_arch_specific_manifest(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Ensure the packaging entry point writes an architecture-aware manifest."""
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_main"
    )
    repo_root = tmp_path / "repo"
    script_path = repo_root / "scripts" / "release" / "package_desktop_artifact.py"
    script_path.parent.mkdir(parents=True)
    script_path.write_text("# placeholder", encoding="utf-8")

    dmg_path = (
        repo_root
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "aarch64-apple-darwin"
        / "release"
        / "bundle"
        / "dmg"
        / "App.dmg"
    )
    dmg_path.parent.mkdir(parents=True)
    dmg_path.write_bytes(b"dmg")

    monkeypatch.setattr(packaging, "__file__", str(script_path))
    monkeypatch.setenv("GITHUB_SHA", "1234567890abcdef")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", "macos")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", "arm64")
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "aarch64-apple-darwin")

    assert packaging.main() == 0
    manifest_path = repo_root / "artifacts" / "bandscope-macos-arm64-1234567890ab.dmg.manifest.txt"

    assert manifest_path.exists()
    assert "platform=macos" in manifest_path.read_text(encoding="utf-8")
    assert "arch=arm64" in manifest_path.read_text(encoding="utf-8")
