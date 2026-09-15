"""Regression tests for release-identity file admission boundaries."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module, make_symlink_or_skip


def _write_minimal_identity_tree(repo_root: Path, version: str = "1.2.3") -> None:
    """Write the smallest canonical release-identity projections used by the guard."""
    (repo_root / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    (repo_root / "package.json").write_text(
        f'{{"version":"{version}"}}\n', encoding="utf-8"
    )
    tauri_config = repo_root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
    tauri_config.parent.mkdir(parents=True)
    tauri_config.write_text(f'{{"version":"{version}"}}\n', encoding="utf-8")


def test_release_identity_rejects_duplicate_json_version_projection(tmp_path: Path) -> None:
    """A parser-dependent duplicate version must not enter release identity."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        "verify_release_identity_duplicate_projection",
    )
    _write_minimal_identity_tree(tmp_path)
    (tmp_path / "package.json").write_text(
        '{"version":"9.9.9","version":"1.2.3"}\n', encoding="utf-8"
    )

    with pytest.raises(ValueError, match="duplicate JSON member"):
        verifier.verify_release_identity(tmp_path)


def test_release_identity_rejects_symlinked_version_authority(tmp_path: Path) -> None:
    """VERSION must be the repository file itself rather than a followed link."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        "verify_release_identity_symlinked_version",
    )
    _write_minimal_identity_tree(tmp_path)
    version_path = tmp_path / "VERSION"
    version_path.unlink()
    target = tmp_path / "version-target.txt"
    target.write_text("1.2.3\n", encoding="utf-8")
    make_symlink_or_skip(version_path, target)

    with pytest.raises(ValueError, match="VERSION must be a regular non-link file"):
        verifier.verify_release_identity(tmp_path)
