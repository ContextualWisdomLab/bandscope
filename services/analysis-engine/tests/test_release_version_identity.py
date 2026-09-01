"""Release identity contracts for the packaged BandScope desktop application."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read_json(relative_path: str) -> dict[str, object]:
    """Return one checked-in JSON document as an object."""
    document = json.loads((_REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return document


def _read_toml(relative_path: str) -> dict[str, object]:
    """Return one checked-in TOML document as an object."""
    with (_REPOSITORY_ROOT / relative_path).open("rb") as stream:
        document = tomllib.load(stream)
    assert isinstance(document, dict)
    return document


def test_packaged_desktop_uses_authoritative_release_version() -> None:
    """Reject release metadata that drifts from the repository VERSION authority."""
    expected = (_REPOSITORY_ROOT / "VERSION").read_text(encoding="utf-8").strip()
    assert expected

    root_package = _read_json("package.json")
    desktop_package = _read_json("apps/desktop/package.json")
    npm_lock = _read_json("package-lock.json")
    tauri_config = _read_json("apps/desktop/src-tauri/tauri.conf.json")
    cargo_manifest = _read_toml("apps/desktop/src-tauri/Cargo.toml")
    cargo_lock = _read_toml("apps/desktop/src-tauri/Cargo.lock")

    npm_packages = npm_lock.get("packages")
    assert isinstance(npm_packages, dict)
    npm_root = npm_packages.get("")
    npm_desktop = npm_packages.get("apps/desktop")
    assert isinstance(npm_root, dict)
    assert isinstance(npm_desktop, dict)

    cargo_package = cargo_manifest.get("package")
    assert isinstance(cargo_package, dict)
    locked_desktop = [
        package
        for package in cargo_lock.get("package", [])
        if isinstance(package, dict) and package.get("name") == "bandscope-desktop"
    ]
    assert len(locked_desktop) == 1

    observed = {
        "package.json": root_package.get("version"),
        "apps/desktop/package.json": desktop_package.get("version"),
        "package-lock.json": npm_lock.get("version"),
        "package-lock.json#packages['']": npm_root.get("version"),
        "package-lock.json#packages['apps/desktop']": npm_desktop.get("version"),
        "apps/desktop/src-tauri/tauri.conf.json": tauri_config.get("version"),
        "apps/desktop/src-tauri/Cargo.toml": cargo_package.get("version"),
        "apps/desktop/src-tauri/Cargo.lock#bandscope-desktop": locked_desktop[0].get("version"),
    }

    assert observed == dict.fromkeys(observed, expected), observed
