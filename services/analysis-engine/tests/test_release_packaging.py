from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType


def load_module(relative_path: str, module_name: str) -> ModuleType:
    repo_root = Path(__file__).resolve().parents[3]
    module_path = repo_root / relative_path
    spec = spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_release_packaging_includes_architecture_in_artifact_identity(
    monkeypatch,
) -> None:
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact"
    )

    monkeypatch.setenv("GITHUB_SHA", "abcdef1234567890")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", "windows")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", "arm64")

    artifact = packaging.artifact_identity()

    assert artifact == {
        "platform": "windows",
        "arch": "arm64",
        "archive_name": "bandscope-windows-arm64-abcdef123456.zip",
        "manifest_name": "bandscope-windows-arm64-abcdef123456.manifest.txt",
    }


def test_expected_binary_path_uses_target_triple_when_provided(monkeypatch, tmp_path: Path) -> None:
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_target"
    )

    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "aarch64-apple-darwin")

    binary_path = packaging.expected_binary_path(tmp_path)

    assert binary_path == (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "aarch64-apple-darwin"
        / "release"
        / "bandscope-desktop"
    )


def test_release_packaging_maps_darwin_to_macos(monkeypatch) -> None:
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_platform"
    )

    monkeypatch.delenv("BANDSCOPE_ARTIFACT_OS", raising=False)
    monkeypatch.setattr(packaging.platform, "system", lambda: "Darwin")

    assert packaging.normalized_platform() == "macos"


def test_release_packaging_main_writes_arch_specific_manifest(monkeypatch, tmp_path: Path) -> None:
    packaging = load_module(
        "scripts/release/package_desktop_artifact.py", "package_desktop_artifact_main"
    )
    repo_root = tmp_path / "repo"
    script_path = repo_root / "scripts" / "release" / "package_desktop_artifact.py"
    script_path.parent.mkdir(parents=True)
    script_path.write_text("# placeholder", encoding="utf-8")
    binary_path = (
        repo_root
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / "aarch64-apple-darwin"
        / "release"
        / "bandscope-desktop"
    )
    binary_path.parent.mkdir(parents=True)
    binary_path.write_bytes(b"binary")
    frontend_file = repo_root / "apps" / "desktop" / "dist" / "index.html"
    frontend_file.parent.mkdir(parents=True)
    frontend_file.write_text("<html></html>", encoding="utf-8")
    for metadata_path in [
        repo_root / "services" / "analysis-engine" / "uv.lock",
        repo_root / "package-lock.json",
        repo_root / "apps" / "desktop" / "src-tauri" / "Cargo.lock",
        repo_root / "supply-chain" / "supplemental-component-inventory.json",
    ]:
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text("metadata", encoding="utf-8")

    monkeypatch.setattr(packaging, "__file__", str(script_path))
    monkeypatch.setenv("GITHUB_SHA", "1234567890abcdef")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", "macos")
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", "arm64")
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", "aarch64-apple-darwin")

    assert packaging.main() == 0
    manifest_path = repo_root / "artifacts" / "bandscope-macos-arm64-1234567890ab.manifest.txt"

    assert manifest_path.exists()
    assert "platform=macos" in manifest_path.read_text(encoding="utf-8")
    assert "arch=arm64" in manifest_path.read_text(encoding="utf-8")
