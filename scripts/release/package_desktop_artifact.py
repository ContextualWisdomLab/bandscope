"""Package desktop build outputs into traceable release artifacts."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from collections import Counter
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, NamedTuple

CommandRunner = Callable[..., Any]
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_FULL_GIT_SHA_RE = re.compile(r"^[0-9a-f]{40}$")


class PackagedArtifact(NamedTuple):
    """Identify one packaged installer and its supporting checksum/manifest evidence."""

    platform: str
    arch: str
    target_triple: str
    archive_name: str
    checksum_name: str
    manifest_name: str


def sha256_file(path: Path) -> str:
    """Return the SHA-256 digest for a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stable_regular_file_identity(path: Path) -> tuple[int, str]:
    """Return size and digest from one stable regular-file descriptor."""
    if path.is_symlink():
        raise RuntimeError("release receipt artifact must not be a symlink")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        file_descriptor = os.open(path, flags)
    except OSError as error:
        raise RuntimeError("release receipt artifact could not be opened") from error

    try:
        before = os.fstat(file_descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise RuntimeError("release receipt artifact must be a regular file")
        digest = hashlib.sha256()
        with os.fdopen(file_descriptor, "rb", closefd=False) as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        after = os.fstat(file_descriptor)
        before_identity = (before.st_dev, before.st_ino, before.st_size)
        after_identity = (after.st_dev, after.st_ino, after.st_size)
        if before_identity != after_identity:
            raise RuntimeError("release receipt artifact changed while hashing")
        return before.st_size, digest.hexdigest()
    finally:
        os.close(file_descriptor)


def normalized_platform() -> str:
    """Return the normalized artifact platform label for the current environment."""
    if artifact_platform := os.environ.get("BANDSCOPE_ARTIFACT_OS"):
        return artifact_platform

    target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE", "")
    if "windows" in target_triple:
        return "windows"
    if "apple-darwin" in target_triple:
        return "macos"

    system = platform.system().lower()
    if system == "darwin":
        return "macos"

    return system


def normalized_architecture() -> str:
    """Return the normalized artifact architecture label for the current environment."""
    if artifact_arch := os.environ.get("BANDSCOPE_ARTIFACT_ARCH"):
        return artifact_arch

    target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE", "")
    if target_triple.startswith(("x86_64", "amd64")):
        return "amd64"
    if target_triple.startswith(("aarch64", "arm64")):
        return "arm64"

    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "amd64"
    if machine in {"arm64", "aarch64"}:
        return "arm64"

    return machine


def resolved_artifact_target() -> tuple[str, str]:
    """Return the normalized platform and architecture for the current artifact target."""
    return normalized_platform(), normalized_architecture()


def artifact_identity(filename: str) -> dict[str, str]:
    """Build the archive and manifest names for the current artifact target."""
    git_sha = os.environ.get("GITHUB_SHA", "local")[:12]
    target_platform, target_arch = resolved_artifact_target()
    suffix = f"bandscope-{target_platform}-{target_arch}-{git_sha}"
    ext = Path(filename).suffix
    return {
        "platform": target_platform,
        "arch": target_arch,
        "archive_name": f"{suffix}{ext}",
        "manifest_name": f"{suffix}{ext}.manifest.txt",
    }


def archive_safe_stem(path: Path) -> str:
    """Return a stable, filename-safe stem for same-extension installer names."""
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.stem).strip("-._")
    return stem or "installer"


def find_installer_packages(repo_root: Path) -> list[Path]:
    """Find built Tauri installers (DMG, EXE, MSI)."""
    target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE")
    target_root = repo_root / "apps" / "desktop" / "src-tauri" / "target"
    if target_triple:
        target_root = target_root / target_triple

    bundle_dir = target_root / "release" / "bundle"
    installers = []

    if bundle_dir.exists():
        for subdirectory, pattern in [("dmg", "*.dmg"), ("nsis", "*.exe"), ("msi", "*.msi")]:
            installers.extend(
                installer
                for installer in sorted((bundle_dir / subdirectory).glob(pattern))
                if installer.is_file() and not installer.is_symlink()
            )

    return sorted(installers)


def _is_tag_release() -> bool:
    """Return whether this package operation belongs to a version-tag release build."""
    return os.environ.get("GITHUB_REF", "").startswith("refs/tags/v")


def verify_tag_release_preflight(
    repo_root: Path,
    *,
    runner: CommandRunner = subprocess.run,
) -> None:
    """Require version and model admission before a tag build writes release artifacts."""
    if not _is_tag_release():
        return
    preflight_path = repo_root / "scripts" / "checks" / "verify_release_identity.py"
    try:
        result = runner([sys.executable, str(preflight_path)], check=False)
    except OSError as verification_error:
        raise RuntimeError("Tagged release preflight could not run") from verification_error
    if result.returncode != 0:
        raise RuntimeError("Tagged release preflight failed")


def _platform_trust_command(repo_root: Path, output_dir: Path) -> Sequence[str]:
    """Build the fixed verifier command for the selected tagged release target."""
    verifier_path = repo_root / "scripts" / "checks" / "verify_release_platform_trust.py"
    target_platform, _ = resolved_artifact_target()
    if target_platform == "windows":
        return [
            sys.executable,
            str(verifier_path),
            "windows",
            str(output_dir),
            "--expected-identity",
            os.environ.get("BANDSCOPE_WINDOWS_PUBLISHER_SUBJECT", ""),
        ]
    if target_platform == "macos":
        target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE", "")
        if not target_triple:
            raise RuntimeError("Tagged macOS release packaging requires BANDSCOPE_TARGET_TRIPLE")
        bundle_root = (
            repo_root
            / "apps"
            / "desktop"
            / "src-tauri"
            / "target"
            / target_triple
            / "release"
            / "bundle"
            / "macos"
        )
        return [
            sys.executable,
            str(verifier_path),
            "macos",
            str(output_dir),
            "--bundle-root",
            str(bundle_root),
            "--expected-identity",
            os.environ.get("BANDSCOPE_APPLE_TEAM_ID", ""),
        ]
    raise RuntimeError("Tagged release packaging is unsupported on this platform")


def verify_tag_platform_trust(
    repo_root: Path,
    output_dir: Path,
    *,
    runner: CommandRunner = subprocess.run,
) -> None:
    """Block tagged artifact publication unless platform-native trust evidence passes."""
    if not _is_tag_release():
        return
    command = _platform_trust_command(repo_root, output_dir)
    try:
        result = runner(list(command), check=False)
    except OSError as verification_error:
        raise RuntimeError("Platform release trust verification could not run") from verification_error
    if result.returncode != 0:
        raise RuntimeError("Platform release trust verification failed")


def _release_version(repo_root: Path) -> str:
    """Return the single-line authoritative release version."""
    version_lines = (repo_root / "VERSION").read_text(encoding="utf-8").splitlines()
    if len(version_lines) != 1 or not version_lines[0].strip():
        raise RuntimeError("release receipt requires one VERSION line")
    version = version_lines[0].strip()
    if version != version_lines[0]:
        raise RuntimeError("release receipt VERSION must not contain surrounding whitespace")
    return version


def _release_source_commit() -> str:
    """Return the exact protected source commit carried by a tagged release receipt."""
    source_commit = os.environ.get("GITHUB_SHA", "").lower()
    if not _FULL_GIT_SHA_RE.fullmatch(source_commit):
        raise RuntimeError("Tagged release receipt requires exact 40-character GITHUB_SHA")
    return source_commit


def _checksum_digest(checksum_path: Path, archive_name: str) -> str:
    """Read the exact single-entry checksum file for one packaged artifact."""
    if checksum_path.is_symlink() or not checksum_path.is_file():
        raise RuntimeError("release receipt checksum must be a regular non-link file")
    if checksum_path.stat().st_size > 512:
        raise RuntimeError("release receipt checksum file is unexpectedly large")
    text = checksum_path.read_text(encoding="utf-8")
    match = re.fullmatch(r"([0-9a-f]{64})  ([^\r\n]+)\n", text)
    if match is None or match.group(2) != archive_name:
        raise RuntimeError("release receipt checksum file is malformed")
    digest = match.group(1)
    if not _SHA256_RE.fullmatch(digest):
        raise RuntimeError("release receipt checksum is not SHA-256")
    return digest


def _validate_support_file(path: Path, label: str) -> None:
    """Require one supporting release file to remain a regular non-link file."""
    if path.is_symlink() or not path.is_file():
        raise RuntimeError(f"release receipt {label} must be a regular non-link file")


def _write_receipt_atomically(receipt_path: Path, payload: str) -> None:
    """Publish receipt bytes atomically after flushing the staged file."""
    file_descriptor, staged_name = tempfile.mkstemp(
        prefix=".release-receipt-", suffix=".tmp", dir=receipt_path.parent
    )
    staged_path = Path(staged_name)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(staged_path, receipt_path)
    finally:
        if staged_path.exists():
            staged_path.unlink()


def write_release_receipt(
    repo_root: Path,
    output_dir: Path,
    packaged_artifacts: Sequence[PackagedArtifact],
) -> Path | None:
    """Bind trusted tagged installer bytes to one deterministic machine-readable receipt."""
    if not _is_tag_release():
        return None
    if not packaged_artifacts:
        raise RuntimeError("Tagged release receipt requires at least one packaged artifact")

    version = _release_version(repo_root)
    tag = os.environ.get("GITHUB_REF", "").removeprefix("refs/tags/")
    if tag != f"v{version}":
        raise RuntimeError("release receipt tag does not match VERSION")
    source_commit = _release_source_commit()

    first = packaged_artifacts[0]
    target_identity = (first.platform, first.arch, first.target_triple)
    receipt_artifacts: list[dict[str, object]] = []
    for packaged_artifact in packaged_artifacts:
        if (
            packaged_artifact.platform,
            packaged_artifact.arch,
            packaged_artifact.target_triple,
        ) != target_identity:
            raise RuntimeError("release receipt cannot mix platform targets")

        archive_path = output_dir / packaged_artifact.archive_name
        checksum_path = output_dir / packaged_artifact.checksum_name
        manifest_path = output_dir / packaged_artifact.manifest_name
        _validate_support_file(manifest_path, "manifest")
        expected_digest = _checksum_digest(checksum_path, packaged_artifact.archive_name)
        size_bytes, actual_digest = _stable_regular_file_identity(archive_path)
        if actual_digest != expected_digest:
            raise RuntimeError("packaged artifact checksum does not match release receipt bytes")
        receipt_artifacts.append(
            {
                "archive": packaged_artifact.archive_name,
                "sizeBytes": size_bytes,
                "sha256": actual_digest,
                "checksumFile": packaged_artifact.checksum_name,
                "manifestFile": packaged_artifact.manifest_name,
            }
        )

    receipt = {
        "schemaVersion": 1,
        "version": version,
        "tag": tag,
        "sourceCommit": source_commit,
        "target": {
            "platform": first.platform,
            "arch": first.arch,
            "targetTriple": first.target_triple,
        },
        "artifacts": sorted(receipt_artifacts, key=lambda artifact: str(artifact["archive"])),
    }
    receipt_path = output_dir / "release-receipt.json"
    payload = json.dumps(receipt, indent=2, sort_keys=False) + "\n"
    _write_receipt_atomically(receipt_path, payload)
    return receipt_path


def main() -> int:
    """Preflight, package installers, calculate checksums, and verify tag trust."""
    repo_root = Path(__file__).resolve().parents[2]
    verify_tag_release_preflight(repo_root)

    output_dir = repo_root / "artifacts"
    output_dir.mkdir(parents=True, exist_ok=True)

    installers = find_installer_packages(repo_root)
    if not installers:
        raise FileNotFoundError(
            "Could not find any built installers (DMG/EXE) in target/release/bundle/"
        )

    suffix_counts = Counter(path.suffix.lower() for path in installers)
    packaged_artifacts: list[PackagedArtifact] = []
    for installer_path in installers:
        identity = artifact_identity(installer_path.name)
        archive_name = identity["archive_name"]

        if suffix_counts[installer_path.suffix.lower()] > 1:
            archive_base = Path(archive_name)
            archive_name = (
                f"{archive_base.stem}-{archive_safe_stem(installer_path)}{archive_base.suffix}"
            )

        archive_path = output_dir / archive_name
        shutil.copy2(installer_path, archive_path)

        checksum_path = output_dir / f"{archive_name}.sha256"
        checksum_path.write_text(
            f"{sha256_file(archive_path)}  {archive_name}\n", encoding="utf-8"
        )

        manifest_path = output_dir / (
            f"{archive_name}.manifest.txt"
            if suffix_counts[installer_path.suffix.lower()] > 1
            else identity["manifest_name"]
        )
        target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE", "native")
        manifest_path.write_text(
            "\n".join(
                [
                    f"platform={identity['platform']}",
                    f"arch={identity['arch']}",
                    f"target_triple={target_triple}",
                    f"original_file={installer_path.name}",
                    f"archive={archive_name}",
                    f"checksum={checksum_path.name}",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        packaged_artifacts.append(
            PackagedArtifact(
                platform=identity["platform"],
                arch=identity["arch"],
                target_triple=target_triple,
                archive_name=archive_name,
                checksum_name=checksum_path.name,
                manifest_name=manifest_path.name,
            )
        )

        print(f"Packaged {installer_path.name} to artifacts/{archive_name}")

    verify_tag_platform_trust(repo_root, output_dir)
    write_release_receipt(repo_root, output_dir, packaged_artifacts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
