"""Distribution contracts for admitted Tauri updater runtime wiring."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_GUARD_PATH = _REPOSITORY_ROOT / "scripts" / "checks" / "verify_release_updater_policy.py"


def _load_guard() -> ModuleType:
    """Load the updater policy guard from its executable repository path."""
    module_spec = importlib.util.spec_from_file_location(
        "verify_release_updater_policy_runtime_wiring", _GUARD_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _write_admitted_fixture(
    repository_root: Path,
    *,
    dependency: bool,
    initializer: bool,
) -> None:
    """Write one admitted updater fixture with optional compiled runtime wiring."""
    (repository_root / "release").mkdir(parents=True, exist_ok=True)
    tauri_root = repository_root / "apps" / "desktop" / "src-tauri"
    source_root = tauri_root / "src"
    source_root.mkdir(parents=True, exist_ok=True)

    public_key = "trusted-minisign-public-key"
    endpoints = ["https://releases.example.invalid/bandscope/latest.json"]
    (repository_root / "release" / "updater-policy.json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "state": "admitted",
                "channel": "stable",
                "minimumSupportedVersion": "0.1.3",
                "publicKey": public_key,
                "endpoints": endpoints,
                "reason": None,
            }
        ),
        encoding="utf-8",
    )
    (tauri_root / "tauri.conf.json").write_text(
        json.dumps(
            {
                "bundle": {"createUpdaterArtifacts": True},
                "plugins": {
                    "updater": {
                        "pubkey": public_key,
                        "endpoints": endpoints,
                    }
                },
            }
        ),
        encoding="utf-8",
    )

    dependency_line = 'tauri-plugin-updater = "2.9.0"\n' if dependency else ""
    (tauri_root / "Cargo.toml").write_text(
        "[package]\nname = \"bandscope-desktop\"\nversion = \"0.1.0\"\n"
        "edition = \"2021\"\n\n[dependencies]\n"
        f"tauri = \"2.11.1\"\n{dependency_line}",
        encoding="utf-8",
    )
    lock_packages = [
        "[[package]]\nname = \"bandscope-desktop\"\nversion = \"0.1.0\"\n",
    ]
    if dependency:
        lock_packages.append(
            "[[package]]\nname = \"tauri-plugin-updater\"\nversion = \"2.9.0\"\n"
            "source = \"registry+https://github.com/rust-lang/crates.io-index\"\n"
            "checksum = \"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"\n"
        )
    (tauri_root / "Cargo.lock").write_text(
        "version = 4\n\n" + "\n".join(lock_packages), encoding="utf-8"
    )

    initializer_line = (
        "        .plugin(tauri_plugin_updater::Builder::new().build())\n"
        if initializer
        else ""
    )
    (source_root / "main.rs").write_text(
        "fn main() {\n"
        "    tauri::Builder::default()\n"
        f"{initializer_line}"
        "        .run(tauri::generate_context!())\n"
        "        .expect(\"error while running tauri application\");\n"
        "}\n",
        encoding="utf-8",
    )


def test_admitted_updater_rejects_missing_compiled_plugin_dependency(tmp_path: Path) -> None:
    """Config-only admission must not pass when updater code is absent from the binary graph."""
    guard = _load_guard()
    _write_admitted_fixture(tmp_path, dependency=False, initializer=False)

    with pytest.raises(ValueError, match="tauri-plugin-updater"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)


def test_admitted_updater_rejects_dependency_without_runtime_initializer(tmp_path: Path) -> None:
    """A locked updater crate is insufficient unless the desktop runtime installs the plugin."""
    guard = _load_guard()
    _write_admitted_fixture(tmp_path, dependency=True, initializer=False)

    with pytest.raises(ValueError, match="runtime initializer"):
        guard.verify_updater_policy(tmp_path, require_admitted=True)


def test_admitted_updater_accepts_locked_dependency_and_runtime_initializer(tmp_path: Path) -> None:
    """Admit the source wiring contract only when config, lock graph, and runtime agree."""
    guard = _load_guard()
    _write_admitted_fixture(tmp_path, dependency=True, initializer=True)

    policy = guard.verify_updater_policy(tmp_path, require_admitted=True)

    assert policy["state"] == "admitted"
