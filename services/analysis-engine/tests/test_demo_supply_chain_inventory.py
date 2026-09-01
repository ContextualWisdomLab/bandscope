"""Supply-chain regressions for the packaged licensed demo assets."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
INVENTORY_PATH = REPO_ROOT / "supply-chain" / "supplemental-component-inventory.json"
DEMO_RESOURCE_ROOT = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "resources" / "demo"
DESKTOP_CORE_SOURCE_PATH = REPO_ROOT / "apps" / "desktop" / "core" / "src" / "lib.rs"
RUNTIME_DEMO_AUDIO_BYTES_PATTERN = re.compile(
    r"pub const DEMO_AUDIO_BYTES: u64 = (?P<demo_audio_bytes>\d+);"
)
EXPECTED_DEMO_ASSETS = {
    "late-night-set.wav": "cfe5716c4e7489db7f14104513ffc70af199137c2320bd66d7b6bec4f41dacc0",
    "LICENSE": "1657b89949ca8bfb2920e26dceb4c1012d6212b5d77eda7d7f3921da29adde5e",
    "annotations.json": "28236d31e72c58bf11aad3945e3407d8e30e71b223326f9ffb82a83091d73044",
    "provenance.json": "1c3ec8f3f7e4a579f45a36f58183ed480ed2757499628dfc5f3dc8deebbdfe38",
}


def test_demo_package_is_listed_in_supplemental_inventory() -> None:
    """Require every packaged demo asset to be inventory-traceable by checksum."""
    actual_demo_assets = {
        asset_path.name
        for asset_path in DEMO_RESOURCE_ROOT.iterdir()
        if not asset_path.is_symlink() and asset_path.is_file()
    }
    assert actual_demo_assets == set(EXPECTED_DEMO_ASSETS)

    inventory_document = json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))
    bundled_assets = inventory_document.get("bundledAssets")

    assert isinstance(bundled_assets, list)
    demo_asset_records = {
        asset_record["storagePath"]: asset_record
        for asset_record in bundled_assets
        if isinstance(asset_record, dict)
        and isinstance(asset_record.get("storagePath"), str)
        and asset_record["storagePath"].startswith("apps/desktop/src-tauri/resources/demo/")
    }

    expected_storage_paths = {
        f"apps/desktop/src-tauri/resources/demo/{asset_name}"
        for asset_name in EXPECTED_DEMO_ASSETS
    }
    assert set(demo_asset_records) == expected_storage_paths

    for asset_name, expected_sha256 in EXPECTED_DEMO_ASSETS.items():
        storage_path = f"apps/desktop/src-tauri/resources/demo/{asset_name}"
        asset_record = demo_asset_records[storage_path]
        asset_bytes = (DEMO_RESOURCE_ROOT / asset_name).read_bytes()

        assert asset_record["assetName"] == asset_name
        assert asset_record["licenseExpression"] == "CC0-1.0"
        assert asset_record["assetChecksum"] == f"sha256:{expected_sha256}"
        assert hashlib.sha256(asset_bytes).hexdigest() == expected_sha256


def test_runtime_demo_audio_size_matches_packaged_artifact() -> None:
    """Keep the Rust runtime size guard synchronized with the bundled demo WAV."""
    desktop_core_source = DESKTOP_CORE_SOURCE_PATH.read_text(encoding="utf-8")
    runtime_size_match = RUNTIME_DEMO_AUDIO_BYTES_PATTERN.search(desktop_core_source)

    assert runtime_size_match is not None
    runtime_demo_audio_bytes = int(runtime_size_match.group("demo_audio_bytes"))
    packaged_demo_audio_bytes = (DEMO_RESOURCE_ROOT / "late-night-set.wav").stat().st_size

    assert runtime_demo_audio_bytes == packaged_demo_audio_bytes
