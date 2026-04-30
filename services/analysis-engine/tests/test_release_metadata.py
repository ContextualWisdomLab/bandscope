"""Tests for repository release metadata consistency."""

from __future__ import annotations

import json
from pathlib import Path


def repo_root() -> Path:
    """Return the repository root from the analysis-engine test directory."""
    start = Path(__file__).resolve()
    for parent in start.parents:
        if (parent / "package.json").is_file() and (parent / "services").is_dir():
            return parent
    raise RuntimeError(f"Could not locate repository root from {start}")


def test_repo_root_walks_to_repository_marker() -> None:
    """Ensure release metadata tests do not rely on fixed directory depth."""
    root = repo_root()

    assert (root / "package.json").is_file()
    assert (root / "services" / "analysis-engine").is_dir()


def root_package_version() -> str:
    """Return the root package version used for release tagging."""
    package_json = json.loads((repo_root() / "package.json").read_text(encoding="utf-8"))
    return str(package_json["version"])


def test_package_lock_release_version_matches_root_package() -> None:
    """Ensure the lockfile release metadata cannot drift from package.json."""
    package_lock = json.loads((repo_root() / "package-lock.json").read_text(encoding="utf-8"))

    assert package_lock["version"] == root_package_version()
    assert package_lock["packages"][""]["version"] == root_package_version()


def test_tauri_release_version_matches_root_package() -> None:
    """Ensure the installable desktop app reports the release version."""
    tauri_config = json.loads(
        (repo_root() / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").read_text(
            encoding="utf-8"
        )
    )

    assert tauri_config["version"] == root_package_version()


def test_version_file_matches_root_package() -> None:
    """Ensure the plain VERSION source cannot drift from release metadata."""
    version_file = (repo_root() / "VERSION").read_text(encoding="utf-8").strip()

    assert version_file == root_package_version()


def test_changelog_contains_root_package_release_entry() -> None:
    """Ensure release branches document the package version being shipped."""
    changelog = (repo_root() / "CHANGELOG.md").read_text(encoding="utf-8")

    assert f"## [{root_package_version()}]" in changelog
