"""Distribution contracts for publishing updater evidence without target collisions."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from conftest import load_module

_FULL_SHA = "abcdef0123456789abcdef0123456789abcdef01"
_SHORT_SHA = _FULL_SHA[:12]


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _write_release_metadata(repo_root: Path) -> None:
    (repo_root / "bandscope-sbom.cdx.json").write_text("{}", encoding="utf-8")
    inventory = repo_root / "supply-chain" / "supplemental-component-inventory.json"
    inventory.parent.mkdir(parents=True)
    inventory.write_text("{}", encoding="utf-8")


def _target_triple(platform_name: str, arch: str) -> str:
    if platform_name == "windows":
        return "x86_64-pc-windows-msvc" if arch == "amd64" else "aarch64-pc-windows-msvc"
    return "x86_64-apple-darwin" if arch == "amd64" else "aarch64-apple-darwin"


def _write_target_release_graph(repo_root: Path, platform_name: str, arch: str) -> list[str]:
    """Write one target's installer, updater evidence, and exact receipt."""
    artifacts = repo_root / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    target_triple = _target_triple(platform_name, arch)
    installer_suffix = ".exe" if platform_name == "windows" else ".dmg"
    installer_name = f"bandscope-{platform_name}-{arch}-{_SHORT_SHA}{installer_suffix}"
    installer_payload = f"installer:{platform_name}:{arch}".encode()
    (artifacts / installer_name).write_bytes(installer_payload)
    checksum_name = f"{installer_name}.sha256"
    (artifacts / checksum_name).write_text(
        f"{_digest(installer_payload)}  {installer_name}\n", encoding="utf-8"
    )
    manifest_name = f"{installer_name}.manifest.txt"
    (artifacts / manifest_name).write_text(
        f"platform={platform_name}\narch={arch}\ntarget_triple={target_triple}\n",
        encoding="utf-8",
    )

    if platform_name == "windows":
        updater_name = installer_name
        updater_payload = installer_payload
    else:
        updater_name = f"bandscope-macos-{arch}-{_SHORT_SHA}.app.tar.gz"
        updater_payload = f"updater:{platform_name}:{arch}".encode()
        (artifacts / updater_name).write_bytes(updater_payload)
    signature_name = f"{updater_name}.sig"
    signature_payload = f"signature:{platform_name}:{arch}".encode()
    (artifacts / signature_name).write_bytes(signature_payload)

    receipt_name = f"bandscope-{platform_name}-{arch}-{_SHORT_SHA}.release-receipt.json"
    receipt = {
        "schemaVersion": 1,
        "version": "1.2.3",
        "tag": "v1.2.3",
        "sourceCommit": _FULL_SHA,
        "target": {
            "platform": platform_name,
            "arch": arch,
            "targetTriple": target_triple,
        },
        "artifacts": [
            {
                "archive": installer_name,
                "sizeBytes": len(installer_payload),
                "sha256": _digest(installer_payload),
                "checksumFile": checksum_name,
                "manifestFile": manifest_name,
            }
        ],
        "updaterArtifacts": [
            {
                "bundle": updater_name,
                "sizeBytes": len(updater_payload),
                "sha256": _digest(updater_payload),
                "signatureFile": signature_name,
                "signatureSizeBytes": len(signature_payload),
                "signatureSha256": _digest(signature_payload),
            }
        ],
    }
    (artifacts / receipt_name).write_text(
        json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8"
    )
    names = [installer_name, checksum_name, manifest_name, signature_name, receipt_name]
    if platform_name == "macos":
        names.append(updater_name)
    return names


def test_release_extractor_accepts_target_receipt_and_tauri_updater_members(
    tmp_path: Path,
) -> None:
    """Downloaded tag artifacts must preserve updater payload/signature/receipt members."""
    extractor = load_module(
        "scripts/release/extract_release_artifacts.py",
        "extract_release_updater_publication_graph",
    )
    archive_path = tmp_path / "release.zip"
    members = {
        f"bandscope-windows-amd64-{_SHORT_SHA}.exe": b"exe",
        f"bandscope-windows-amd64-{_SHORT_SHA}.exe.sig": b"sig",
        f"bandscope-macos-arm64-{_SHORT_SHA}.app.tar.gz": b"tar",
        f"bandscope-macos-arm64-{_SHORT_SHA}.app.tar.gz.sig": b"sig",
        f"bandscope-macos-arm64-{_SHORT_SHA}.release-receipt.json": b"{}\n",
    }
    with zipfile.ZipFile(archive_path, "w") as archive:
        for name, payload in members.items():
            archive.writestr(name, payload)

    extracted = extractor.extract_release_artifacts(archive_path, tmp_path / "out")

    assert {path.name for path in extracted} == set(members)


def test_release_selector_requires_complete_updater_graph_and_target_receipts(
    tmp_path: Path,
) -> None:
    """Immutable publication must select and re-admit all four target updater receipts."""
    selector = load_module(
        "scripts/release/select_release_assets.py",
        "select_release_assets_updater_publication_graph",
    )
    _write_release_metadata(tmp_path)
    artifact_names: list[str] = []
    for platform_name, arch in [
        ("windows", "amd64"),
        ("windows", "arm64"),
        ("macos", "amd64"),
        ("macos", "arm64"),
    ]:
        artifact_names.extend(_write_target_release_graph(tmp_path, platform_name, arch))

    selected = selector.select_release_assets(tmp_path, git_sha=_FULL_SHA)

    assert selected == [
        *(f"artifacts/{name}" for name in sorted(artifact_names)),
        "bandscope-sbom.cdx.json",
        "supply-chain/supplemental-component-inventory.json",
    ]


def test_release_selector_rejects_receipt_bound_updater_signature_drift(tmp_path: Path) -> None:
    """Publisher re-admission must reject updater bytes changed after target packaging."""
    selector = load_module(
        "scripts/release/select_release_assets.py",
        "select_release_assets_updater_signature_drift",
    )
    _write_release_metadata(tmp_path)
    for platform_name, arch in [
        ("windows", "amd64"),
        ("windows", "arm64"),
        ("macos", "amd64"),
        ("macos", "arm64"),
    ]:
        _write_target_release_graph(tmp_path, platform_name, arch)

    signature = tmp_path / "artifacts" / f"bandscope-windows-amd64-{_SHORT_SHA}.exe.sig"
    signature.write_bytes(b"tampered-signature")

    try:
        selector.select_release_assets(tmp_path, git_sha=_FULL_SHA)
    except ValueError as error:
        assert "receipt" in str(error) or "signature" in str(error)
    else:
        raise AssertionError("tampered updater signature must fail publisher re-admission")
