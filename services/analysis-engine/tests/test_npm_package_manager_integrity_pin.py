"""Contracts for integrity-bound Corepack acquisition of the reviewed npm runtime."""

from __future__ import annotations

import json
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_EXPECTED_PACKAGE_MANAGER = (
    "npm@10.9.9+sha512."
    "d60fba8cb42f688b81e33c2f1cbef2ad7b977166700ec0ad057f1b6d60ea6ef"
    "2524abf673e20c35931cd8305d1dbb8887134d6eefdc0e7b8435bd458bf65b862"
)
_EXPECTED_LOCATOR_PATTERN = (
    r"/^npm@[0-9]+\.[0-9]+\.[0-9]+\+sha512\.[0-9a-f]{128}$/"
)


def test_root_manifest_integrity_pins_the_reviewed_npm_artifact() -> None:
    """Require Corepack metadata to bind npm 10.9.9 to its reviewed SHA-512 artifact."""
    manifest = json.loads((_REPOSITORY_ROOT / "package.json").read_text(encoding="utf-8"))

    assert manifest["packageManager"] == _EXPECTED_PACKAGE_MANAGER


def test_activation_helper_rejects_version_only_package_manager_locators() -> None:
    """Prevent an exact version from being mistaken for package-manager artifact integrity."""
    source = (
        _REPOSITORY_ROOT / "scripts" / "checks" / "activate_pinned_npm_runtime.sh"
    ).read_text(encoding="utf-8")

    assert _EXPECTED_LOCATOR_PATTERN in source
    assert 'corepack install --global "$package_manager_spec"' in source
