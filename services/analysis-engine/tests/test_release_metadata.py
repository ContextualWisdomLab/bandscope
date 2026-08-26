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


def test_changelog_preserves_dependency_security_baseline_as_fixed() -> None:
    """Keep the shipped dependency-security repair classified as a fix in Unreleased."""
    changelog = (repo_root() / "CHANGELOG.md").read_text(encoding="utf-8")
    unreleased = changelog.split("## [0.1.3]", maxsplit=1)[0]
    fixed = unreleased.split("### Fixed", maxsplit=1)[1]
    security_fix = "Upgraded the local score PDF parser to `pdfjs-dist` 6.2.108"

    assert security_fix in fixed


def test_changelog_level_three_headings_are_surrounded_by_blank_lines() -> None:
    """Ensure changelog subsections stay compatible with Markdown heading lint."""
    lines = (repo_root() / "CHANGELOG.md").read_text(encoding="utf-8").splitlines()

    for index, line in enumerate(lines[:-1]):
        if line.startswith("### "):
            assert lines[index + 1] == "", f"missing blank line after {line!r}"


def test_rollout_plan_treats_github_releases_as_distribution_channel() -> None:
    """Ensure release trust comes from verification evidence, not the hosting channel."""
    plan = (repo_root() / "docs" / "plans" / "2026-04-28-pr-159-rollout.md").read_text(
        encoding="utf-8"
    )

    assert "GitHub Releases serves as the trusted source" not in plan
    assert "GitHub Releases is a distribution channel" in plan
