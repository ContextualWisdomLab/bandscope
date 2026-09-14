"""Distribution contracts for exact Tauri updater artifact binding."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from types import ModuleType

import pytest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
_PACKAGER_PATH = _REPOSITORY_ROOT / "scripts" / "release" / "package_desktop_artifact.py"


def _load_packager() -> ModuleType:
    """Load the repository-owned desktop packager for focused updater tests."""
    module_spec = importlib.util.spec_from_file_location(
        "package_desktop_artifact_updater_binding", _PACKAGER_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _set_tag_target(
    monkeypatch: pytest.MonkeyPatch,
    *,
    platform_name: str,
    arch: str,
    target_triple: str,
) -> None:
    """Set exact tag/target identity used by updater packaging scenarios."""
    monkeypatch.setenv("GITHUB_REF", "refs/tags/v1.2.3")
    monkeypatch.setenv("GITHUB_SHA", "a" * 40)
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_OS", platform_name)
    monkeypatch.setenv("BANDSCOPE_ARTIFACT_ARCH", arch)
    monkeypatch.setenv("BANDSCOPE_TARGET_TRIPLE", target_triple)


def _write_standard_packaged_artifact(
    packager: ModuleType,
    output_dir: Path,
    *,
    platform_name: str,
    arch: str,
    target_triple: str,
    archive_name: str,
    payload: bytes,
) -> object:
    """Write one checksum-bound standard artifact used by the receipt contract."""
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / archive_name
    archive_path.write_bytes(payload)
    checksum_name = f"{archive_name}.sha256"
    (output_dir / checksum_name).write_text(
        f"{hashlib.sha256(payload).hexdigest()}  {archive_name}\n",
        encoding="utf-8",
    )
    manifest_name = f"{archive_name}.manifest.txt"
    (output_dir / manifest_name).write_text(
        f"platform={platform_name}\narch={arch}\ntarget_triple={target_triple}\n",
        encoding="utf-8",
    )
    return packager.PackagedArtifact(
        platform=platform_name,
        arch=arch,
        target_triple=target_triple,
        archive_name=archive_name,
        checksum_name=checksum_name,
        manifest_name=manifest_name,
    )


def test_windows_tag_requires_adjacent_tauri_signature_and_binds_exact_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Windows release evidence must include the exact Tauri signature for each installer."""
    packager = _load_packager()
    target_triple = "x86_64-pc-windows-msvc"
    _set_tag_target(
        monkeypatch,
        platform_name="windows",
        arch="amd64",
        target_triple=target_triple,
    )
    bundle_root = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / target_triple
        / "release"
        / "bundle"
        / "nsis"
    )
    bundle_root.mkdir(parents=True)
    source_installer = bundle_root / "BandScope-setup.exe"
    source_installer.write_bytes(b"signed-windows-installer")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_standard_packaged_artifact(
        packager,
        output_dir,
        platform_name="windows",
        arch="amd64",
        target_triple=target_triple,
        archive_name="bandscope-windows-amd64-aaaaaaaaaaaa.exe",
        payload=b"signed-windows-installer",
    )

    with pytest.raises(RuntimeError, match="updater signature"):
        packager.package_tag_updater_artifacts(
            tmp_path,
            output_dir,
            [(source_installer, packaged_artifact)],
        )

    signature_bytes = b"untrusted comment: signature\ntrusted-signature-payload\n"
    Path(f"{source_installer}.sig").write_bytes(signature_bytes)
    updater_artifacts = packager.package_tag_updater_artifacts(
        tmp_path,
        output_dir,
        [(source_installer, packaged_artifact)],
    )

    assert len(updater_artifacts) == 1
    updater = updater_artifacts[0]
    assert updater.bundle_name == packaged_artifact.archive_name
    assert updater.signature_name == f"{packaged_artifact.archive_name}.sig"
    assert (output_dir / updater.signature_name).read_bytes() == signature_bytes
    assert updater.signature_sha256 == hashlib.sha256(signature_bytes).hexdigest()


def test_macos_tag_requires_app_tarball_and_signature_before_release_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """macOS updater evidence must carry the Tauri .app.tar.gz bundle and its signature."""
    packager = _load_packager()
    target_triple = "aarch64-apple-darwin"
    _set_tag_target(
        monkeypatch,
        platform_name="macos",
        arch="arm64",
        target_triple=target_triple,
    )
    bundle_root = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / target_triple
        / "release"
        / "bundle"
    )
    dmg_root = bundle_root / "dmg"
    macos_root = bundle_root / "macos"
    dmg_root.mkdir(parents=True)
    macos_root.mkdir(parents=True)
    source_dmg = dmg_root / "BandScope.dmg"
    source_dmg.write_bytes(b"notarized-dmg")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_standard_packaged_artifact(
        packager,
        output_dir,
        platform_name="macos",
        arch="arm64",
        target_triple=target_triple,
        archive_name="bandscope-macos-arm64-aaaaaaaaaaaa.dmg",
        payload=b"notarized-dmg",
    )

    with pytest.raises(RuntimeError, match="macOS updater bundle"):
        packager.package_tag_updater_artifacts(
            tmp_path,
            output_dir,
            [(source_dmg, packaged_artifact)],
        )

    updater_bundle = macos_root / "BandScope.app.tar.gz"
    updater_bundle.write_bytes(b"signed-app-tarball")
    with pytest.raises(RuntimeError, match="updater signature"):
        packager.package_tag_updater_artifacts(
            tmp_path,
            output_dir,
            [(source_dmg, packaged_artifact)],
        )

    signature_bytes = b"untrusted comment: signature\nmacos-signature\n"
    Path(f"{updater_bundle}.sig").write_bytes(signature_bytes)
    updater_artifacts = packager.package_tag_updater_artifacts(
        tmp_path,
        output_dir,
        [(source_dmg, packaged_artifact)],
    )

    updater = updater_artifacts[0]
    assert updater.bundle_name == "bandscope-macos-arm64-aaaaaaaaaaaa.app.tar.gz"
    assert updater.signature_name == f"{updater.bundle_name}.sig"
    assert (output_dir / updater.bundle_name).read_bytes() == b"signed-app-tarball"
    assert (output_dir / updater.signature_name).read_bytes() == signature_bytes


def test_release_receipt_binds_updater_bundle_and_signature_against_post_copy_drift(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Receipt generation must fail if copied updater evidence drifts before publication."""
    packager = _load_packager()
    target_triple = "x86_64-pc-windows-msvc"
    _set_tag_target(
        monkeypatch,
        platform_name="windows",
        arch="amd64",
        target_triple=target_triple,
    )
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    source_root = (
        tmp_path
        / "apps"
        / "desktop"
        / "src-tauri"
        / "target"
        / target_triple
        / "release"
        / "bundle"
        / "nsis"
    )
    source_root.mkdir(parents=True)
    source_installer = source_root / "BandScope-setup.exe"
    source_installer.write_bytes(b"signed-installer")
    Path(f"{source_installer}.sig").write_bytes(b"signature-v1")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_standard_packaged_artifact(
        packager,
        output_dir,
        platform_name="windows",
        arch="amd64",
        target_triple=target_triple,
        archive_name="bandscope-windows-amd64-aaaaaaaaaaaa.exe",
        payload=b"signed-installer",
    )
    updater_artifacts = packager.package_tag_updater_artifacts(
        tmp_path,
        output_dir,
        [(source_installer, packaged_artifact)],
    )
    updater = updater_artifacts[0]

    receipt_path = packager.write_release_receipt(
        tmp_path,
        output_dir,
        [packaged_artifact],
        updater_artifacts,
    )
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert receipt["updaterArtifacts"] == [
        {
            "bundle": updater.bundle_name,
            "sizeBytes": updater.bundle_size_bytes,
            "sha256": updater.bundle_sha256,
            "signatureFile": updater.signature_name,
            "signatureSizeBytes": updater.signature_size_bytes,
            "signatureSha256": updater.signature_sha256,
        }
    ]

    (output_dir / updater.signature_name).write_bytes(b"signature-v2")
    with pytest.raises(RuntimeError, match="updater signature changed"):
        packager.write_release_receipt(
            tmp_path,
            output_dir,
            [packaged_artifact],
            updater_artifacts,
        )


def test_non_tag_build_does_not_require_or_publish_updater_artifacts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Unsigned branch validation remains independent from commercial updater authority."""
    packager = _load_packager()
    monkeypatch.setenv("GITHUB_REF", "refs/heads/develop")

    assert packager.package_tag_updater_artifacts(tmp_path, tmp_path / "artifacts", []) == []
