"""Distribution contracts for the exact packaged-release receipt."""

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
    """Load the repository-owned packager for focused release-receipt tests."""
    module_spec = importlib.util.spec_from_file_location(
        "package_desktop_artifact_release_receipt", _PACKAGER_PATH
    )
    assert module_spec is not None and module_spec.loader is not None
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def _write_packaged_artifact(
    output_dir: Path,
    *,
    archive_name: str = "bandscope-windows-amd64-deadbeef0000.exe",
    payload: bytes = b"signed-installer-bytes",
) -> object:
    """Create one checksum-bound packaged artifact using the production value object."""
    packager = _load_packager()
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
        "platform=windows\narch=amd64\ntarget_triple=x86_64-pc-windows-msvc\n",
        encoding="utf-8",
    )
    return packager.PackagedArtifact(
        platform="windows",
        arch="amd64",
        target_triple="x86_64-pc-windows-msvc",
        archive_name=archive_name,
        checksum_name=checksum_name,
        manifest_name=manifest_name,
    )


def test_tag_release_receipt_binds_version_commit_and_exact_artifact_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Record one deterministic receipt only for the exact trusted tag artifact bytes."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    monkeypatch.setenv("GITHUB_REF", "refs/tags/v1.2.3")
    monkeypatch.setenv("GITHUB_SHA", "a" * 40)

    receipt_path = packager.write_release_receipt(
        tmp_path, output_dir, [packaged_artifact]
    )

    assert receipt_path == output_dir / "release-receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert receipt == {
        "schemaVersion": 1,
        "version": "1.2.3",
        "tag": "v1.2.3",
        "sourceCommit": "a" * 40,
        "target": {
            "platform": "windows",
            "arch": "amd64",
            "targetTriple": "x86_64-pc-windows-msvc",
        },
        "artifacts": [
            {
                "archive": packaged_artifact.archive_name,
                "sizeBytes": len(b"signed-installer-bytes"),
                "sha256": hashlib.sha256(b"signed-installer-bytes").hexdigest(),
                "checksumFile": packaged_artifact.checksum_name,
                "manifestFile": packaged_artifact.manifest_name,
            }
        ],
    }
    assert receipt_path.read_text(encoding="utf-8").endswith("\n")


def test_release_receipt_rejects_artifact_drift_after_checksum(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail closed if packaged installer bytes drift after their checksum was written."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir, payload=b"model-A")
    (output_dir / packaged_artifact.archive_name).write_bytes(b"model-B")
    monkeypatch.setenv("GITHUB_REF", "refs/tags/v1.2.3")
    monkeypatch.setenv("GITHUB_SHA", "b" * 40)

    with pytest.raises(RuntimeError, match="packaged artifact checksum does not match"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_release_receipt_requires_exact_tag_and_full_source_commit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Reject receipts whose release tag or source commit is not the exact release identity."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    monkeypatch.setenv("GITHUB_REF", "refs/tags/v1.2.4")
    monkeypatch.setenv("GITHUB_SHA", "c" * 40)
    with pytest.raises(RuntimeError, match="release receipt tag does not match VERSION"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])

    monkeypatch.setenv("GITHUB_REF", "refs/tags/v1.2.3")
    monkeypatch.setenv("GITHUB_SHA", "short-sha")
    with pytest.raises(RuntimeError, match="exact 40-character GITHUB_SHA"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_non_tag_packaging_does_not_publish_release_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Keep unsigned PR/develop packages from masquerading as immutable release receipts."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    monkeypatch.setenv("GITHUB_REF", "refs/heads/develop")
    monkeypatch.setenv("GITHUB_SHA", "d" * 40)

    assert (
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])
        is None
    )
    assert not (output_dir / "release-receipt.json").exists()


def test_tag_packager_writes_receipt_only_after_platform_trust() -> None:
    """Never publish release receipt authority before native signing/notarization checks pass."""
    packager_text = _PACKAGER_PATH.read_text(encoding="utf-8")
    trust_call = "verify_tag_platform_trust(repo_root, output_dir)"
    receipt_call = "write_release_receipt(repo_root, output_dir, packaged_artifacts)"
    assert trust_call in packager_text
    assert receipt_call in packager_text
    assert packager_text.index(trust_call) < packager_text.index(receipt_call)
