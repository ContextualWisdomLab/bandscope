"""Distribution contracts for the exact packaged-release receipt."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import stat
from pathlib import Path
from types import ModuleType, SimpleNamespace

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


def _set_tag_identity(monkeypatch: pytest.MonkeyPatch, version: str = "1.2.3") -> None:
    """Set exact GitHub tag/commit identity used by tagged receipt scenarios."""
    monkeypatch.setenv("GITHUB_REF", f"refs/tags/v{version}")
    monkeypatch.setenv("GITHUB_SHA", "a" * 40)


def test_tag_release_receipt_binds_version_commit_and_exact_artifact_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Record one deterministic receipt only for the exact trusted tag artifact bytes."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    _set_tag_identity(monkeypatch)

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
    _set_tag_identity(monkeypatch)

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


def test_release_receipt_rejects_ambiguous_version_authority(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Keep receipt generation bound to the same unambiguous VERSION authority."""
    packager = _load_packager()
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    _set_tag_identity(monkeypatch)

    (tmp_path / "VERSION").write_text("1.2.3\n2.0.0\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="requires one VERSION line"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])

    (tmp_path / "VERSION").write_text(" 1.2.3\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="must not contain surrounding whitespace"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_release_receipt_rejects_empty_or_mixed_target_inventory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Require one non-empty platform/architecture target per receipt."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    _set_tag_identity(monkeypatch)

    with pytest.raises(RuntimeError, match="at least one packaged artifact"):
        packager.write_release_receipt(tmp_path, output_dir, [])

    first = _write_packaged_artifact(output_dir)
    second = _write_packaged_artifact(
        output_dir,
        archive_name="bandscope-macos-amd64-deadbeef0000.dmg",
        payload=b"signed-macos-installer",
    )._replace(platform="macos", target_triple="x86_64-apple-darwin")
    with pytest.raises(RuntimeError, match="cannot mix platform targets"):
        packager.write_release_receipt(tmp_path, output_dir, [first, second])


def test_release_receipt_rejects_missing_or_malformed_support_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Require exact checksum syntax and a regular per-artifact manifest."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    _set_tag_identity(monkeypatch)

    manifest_path = output_dir / packaged_artifact.manifest_name
    manifest_path.unlink()
    with pytest.raises(RuntimeError, match="manifest must be a regular non-link file"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])

    manifest_path.write_text("restored\n", encoding="utf-8")
    checksum_path = output_dir / packaged_artifact.checksum_name
    checksum_path.write_text("not-a-checksum\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="checksum file is malformed"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])

    checksum_path.write_text("x" * 513, encoding="utf-8")
    with pytest.raises(RuntimeError, match="checksum file is unexpectedly large"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_release_receipt_rejects_linked_or_missing_checksum(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Do not let supporting checksum authority resolve through missing/link indirection."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    _set_tag_identity(monkeypatch)
    checksum_path = output_dir / packaged_artifact.checksum_name
    checksum_path.unlink()

    with pytest.raises(RuntimeError, match="checksum must be a regular non-link file"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])

    target = output_dir / "other-checksum.txt"
    target.write_text("placeholder\n", encoding="utf-8")
    try:
        checksum_path.symlink_to(target)
    except OSError:
        pytest.skip("symlinks are unavailable on this test platform")
    with pytest.raises(RuntimeError, match="checksum must be a regular non-link file"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_release_receipt_rejects_symlinked_archive(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Do not derive immutable release authority through archive symlink indirection."""
    packager = _load_packager()
    (tmp_path / "VERSION").write_text("1.2.3\n", encoding="utf-8")
    output_dir = tmp_path / "artifacts"
    packaged_artifact = _write_packaged_artifact(output_dir)
    _set_tag_identity(monkeypatch)
    archive_path = output_dir / packaged_artifact.archive_name
    payload = archive_path.read_bytes()
    archive_path.unlink()
    target = output_dir / "other.exe"
    target.write_bytes(payload)
    try:
        archive_path.symlink_to(target)
    except OSError:
        pytest.skip("symlinks are unavailable on this test platform")

    with pytest.raises(RuntimeError, match="artifact must not be a symlink"):
        packager.write_release_receipt(tmp_path, output_dir, [packaged_artifact])


def test_stable_file_identity_fails_on_non_regular_or_drifting_descriptor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail closed when the opened descriptor is not regular or changes while hashing."""
    packager = _load_packager()
    archive_path = tmp_path / "archive.bin"
    archive_path.write_bytes(b"payload")
    real_fstat = os.fstat

    monkeypatch.setattr(
        packager.os,
        "fstat",
        lambda _descriptor: SimpleNamespace(
            st_mode=stat.S_IFDIR,
            st_dev=1,
            st_ino=1,
            st_size=0,
        ),
    )
    with pytest.raises(RuntimeError, match="artifact must be a regular file"):
        packager._stable_regular_file_identity(archive_path)

    calls = 0

    def drifting_fstat(descriptor: int) -> object:
        nonlocal calls
        calls += 1
        result = real_fstat(descriptor)
        if calls == 1:
            return result
        return SimpleNamespace(
            st_mode=result.st_mode,
            st_dev=result.st_dev,
            st_ino=result.st_ino,
            st_size=result.st_size + 1,
        )

    monkeypatch.setattr(packager.os, "fstat", drifting_fstat)
    with pytest.raises(RuntimeError, match="artifact changed while hashing"):
        packager._stable_regular_file_identity(archive_path)


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
