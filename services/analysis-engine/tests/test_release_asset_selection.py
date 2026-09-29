"""Tests for release asset selection and stray-file rejection."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest
from conftest import load_module, make_symlink_or_skip


def _write_release_metadata(repo_root: Path) -> None:
    (repo_root / "bandscope-sbom.cdx.json").write_text("{}", encoding="utf-8")
    inventory = repo_root / "supply-chain" / "supplemental-component-inventory.json"
    inventory.parent.mkdir(parents=True)
    inventory.write_text("{}", encoding="utf-8")


def _full_sha(sha: str) -> str:
    """Expand a short fixture SHA into one deterministic full receipt commit."""
    return sha if len(sha) == 40 else sha + ("0" * (40 - len(sha)))


def _target_triple(platform: str, arch: str) -> str:
    if platform == "windows":
        return "x86_64-pc-windows-msvc" if arch == "amd64" else "aarch64-pc-windows-msvc"
    return "x86_64-apple-darwin" if arch == "amd64" else "aarch64-apple-darwin"


def _digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _write_installer(repo_root: Path, platform: str, arch: str, sha: str, suffix: str) -> str:
    """Write one complete target installer/updater/receipt publication graph."""
    artifacts = repo_root / "artifacts"
    artifacts.mkdir(parents=True, exist_ok=True)
    archive_name = f"bandscope-{platform}-{arch}-{sha[:12]}{suffix}"
    installer_payload = f"{platform}-{arch}".encode()
    (artifacts / archive_name).write_bytes(installer_payload)
    checksum_name = f"{archive_name}.sha256"
    (artifacts / checksum_name).write_text(
        f"{_digest(installer_payload)}  {archive_name}\n", encoding="utf-8"
    )
    manifest_name = f"{archive_name}.manifest.txt"
    target_triple = _target_triple(platform, arch)
    (artifacts / manifest_name).write_text(
        f"platform={platform}\narch={arch}\ntarget_triple={target_triple}\narchive={archive_name}\n",
        encoding="utf-8",
    )

    if platform == "windows":
        updater_name = archive_name
        updater_payload = installer_payload
    else:
        updater_name = f"bandscope-macos-{arch}-{sha[:12]}.app.tar.gz"
        updater_payload = f"updater-{platform}-{arch}".encode()
        (artifacts / updater_name).write_bytes(updater_payload)
    signature_name = f"{updater_name}.sig"
    signature_payload = f"signature-{platform}-{arch}".encode()
    (artifacts / signature_name).write_bytes(signature_payload)

    receipt_name = f"bandscope-{platform}-{arch}-{sha[:12]}.release-receipt.json"
    receipt = {
        "schemaVersion": 1,
        "version": "1.2.3",
        "tag": "v1.2.3",
        "sourceCommit": _full_sha(sha),
        "target": {
            "platform": platform,
            "arch": arch,
            "targetTriple": target_triple,
        },
        "artifacts": [
            {
                "archive": archive_name,
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
        json.dumps(receipt) + "\n", encoding="utf-8"
    )
    return archive_name


def test_select_release_assets_returns_only_validated_release_files(tmp_path: Path) -> None:
    """Select installers, updater evidence, target receipts, SBOM, and inventory."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_valid"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".msi"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    assets = selector.select_release_assets(tmp_path, git_sha=sha)

    expected_artifacts = sorted(
        f"artifacts/{path.name}" for path in (tmp_path / "artifacts").iterdir()
    )
    assert assets == [
        *expected_artifacts,
        "bandscope-sbom.cdx.json",
        "supply-chain/supplemental-component-inventory.json",
    ]


def test_validate_asset_list_rejects_drift_from_strict_allowlist(tmp_path: Path) -> None:
    """Reject release asset lists that diverge after selection."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_input_drift"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".msi"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)
    expected_assets = selector.select_release_assets(tmp_path, git_sha=sha)
    asset_list = tmp_path / "release-assets.txt"
    selector.write_asset_list(asset_list, [*expected_assets, "artifacts/debug.log"])

    with pytest.raises(ValueError, match="does not match strict allowlist"):
        selector.validate_asset_list(asset_list, expected_assets)


def test_select_release_assets_rejects_stray_artifact_file(tmp_path: Path) -> None:
    """Fail closed when an unexpected artifact could otherwise be released."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_stray"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)
    (tmp_path / "artifacts" / "bandscope-windows-amd64-debug.log").write_text(
        "debug", encoding="utf-8"
    )

    with pytest.raises(ValueError, match="unexpected release artifact"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_rejects_symlink_artifact(tmp_path: Path) -> None:
    """Fail closed when a release artifact is a symlink rather than a regular file."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_symlink"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    linked_archive = f"bandscope-windows-amd64-{sha}.exe"
    artifacts = tmp_path / "artifacts"
    artifacts.mkdir(parents=True)
    symlink_target = tmp_path / "payload.exe"
    symlink_target.write_text("payload", encoding="utf-8")
    make_symlink_or_skip(artifacts / linked_archive, symlink_target)
    (artifacts / f"{linked_archive}.sha256").write_text(
        f"{'0' * 64}  {linked_archive}\n", encoding="utf-8"
    )
    (artifacts / f"{linked_archive}.manifest.txt").write_text(
        f"platform=windows\narch=amd64\narchive={linked_archive}\n",
        encoding="utf-8",
    )
    for platform, arch, suffix in [
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    with pytest.raises(ValueError, match="unexpected release artifact path"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_rejects_symlink_metadata(tmp_path: Path) -> None:
    """Fail closed when required release metadata is a symlink."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_symlink_metadata"
    )
    sha = "abc123def456"
    sbom_target = tmp_path / "sbom-target.json"
    sbom_target.write_text("{}", encoding="utf-8")
    make_symlink_or_skip(tmp_path / "bandscope-sbom.cdx.json", sbom_target)
    inventory = tmp_path / "supply-chain" / "supplemental-component-inventory.json"
    inventory.parent.mkdir(parents=True)
    inventory.write_text("{}", encoding="utf-8")
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    with pytest.raises(ValueError, match="missing release asset"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_rejects_unsanctioned_archive_suffix(tmp_path: Path) -> None:
    """Fail closed when an archive adds an unapproved suffix after the SHA."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_debug_suffix"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    for platform, arch, suffix in [
        ("windows", "amd64", ".exe"),
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)
    debug_archive = f"bandscope-windows-amd64-{sha}-debug.exe"
    artifacts = tmp_path / "artifacts"
    (artifacts / debug_archive).write_text("debug", encoding="utf-8")
    (artifacts / f"{debug_archive}.sha256").write_text(
        f"{'0' * 64}  {debug_archive}\n", encoding="utf-8"
    )
    (artifacts / f"{debug_archive}.manifest.txt").write_text(
        f"platform=windows\narch=amd64\narchive={debug_archive}\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="unexpected release artifact"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_requires_installer_sidecars(tmp_path: Path) -> None:
    """Reject installers missing their checksum or manifest sidecars."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_sidecars"
    )
    sha = "abc123def456"
    _write_release_metadata(tmp_path)
    archive = _write_installer(tmp_path, "windows", "amd64", sha, ".exe")
    (tmp_path / "artifacts" / f"{archive}.sha256").unlink()
    for platform, arch, suffix in [
        ("windows", "arm64", ".exe"),
        ("macos", "amd64", ".dmg"),
        ("macos", "arm64", ".dmg"),
    ]:
        _write_installer(tmp_path, platform, arch, sha, suffix)

    with pytest.raises(ValueError, match="missing checksum"):
        selector.select_release_assets(tmp_path, git_sha=sha)


def test_select_release_assets_cli_writes_validation_errors_to_stderr(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    """Ensure CLI failures cannot corrupt stdout asset lists."""
    selector = load_module(
        "scripts/release/select_release_assets.py", "select_release_assets_cli_stderr"
    )

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(sys, "argv", ["select_release_assets.py"])

    assert selector.main() == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "Release asset validation failed:" in captured.err
