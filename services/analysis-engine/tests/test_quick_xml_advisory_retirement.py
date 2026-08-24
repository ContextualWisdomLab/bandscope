"""Regression contract for retiring the quick-xml RustSec exceptions."""

from __future__ import annotations

import tomllib
from pathlib import Path

RUSTSEC_IDS = {"RUSTSEC-2026-0194", "RUSTSEC-2026-0195"}
MINIMUM_QUICK_XML = (0, 41, 0)
MINIMUM_WAYLAND_SCANNER = (0, 31, 11)


def _version_tuple(value: str) -> tuple[int, int, int]:
    """Return the three numeric components used by the pinned Rust packages."""
    major, minor, patch = value.split(".")
    return int(major), int(minor), int(patch)


def test_quick_xml_advisories_are_retired_from_desktop_lock_and_scanners() -> None:
    """Patched owner chains must replace the temporary quick-xml exceptions."""
    repository_root = Path(__file__).resolve().parents[3]
    tauri_root = repository_root / "apps" / "desktop" / "src-tauri"
    lock = tomllib.loads((tauri_root / "Cargo.lock").read_text(encoding="utf-8"))

    packages = lock["package"]
    quick_xml_versions = [
        _version_tuple(package["version"]) for package in packages if package["name"] == "quick-xml"
    ]
    wayland_scanner_versions = [
        _version_tuple(package["version"])
        for package in packages
        if package["name"] == "wayland-scanner"
    ]

    assert quick_xml_versions
    assert all(version >= MINIMUM_QUICK_XML for version in quick_xml_versions)
    assert wayland_scanner_versions == [MINIMUM_WAYLAND_SCANNER]

    audit_policy = (tauri_root / ".cargo" / "audit.toml").read_text(encoding="utf-8")
    osv_policy = (tauri_root / "osv-scanner.toml").read_text(encoding="utf-8")
    for advisory_id in RUSTSEC_IDS:
        assert advisory_id not in audit_policy
        assert advisory_id not in osv_policy
