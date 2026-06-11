"""Package desktop build outputs into traceable release artifacts."""

from __future__ import annotations

import hashlib
import os
import platform
import re
import shutil
from collections import Counter
from pathlib import Path


def sha256_file(path: Path) -> str:
    """Return the SHA-256 digest for a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    """Find built Tauri installers (APP, EXE, MSI)."""
    target_triple = os.environ.get("BANDSCOPE_TARGET_TRIPLE")
    target_root = repo_root / "apps" / "desktop" / "src-tauri" / "target"
    if target_triple:
        target_root = target_root / target_triple

    bundle_dir = target_root / "release" / "bundle"
    installers = []

    if bundle_dir.exists():
        for subdirectory, pattern in [("macos", "*.app"), ("nsis", "*.exe"), ("msi", "*.msi")]:
            installers.extend(
                installer
                for installer in sorted((bundle_dir / subdirectory).glob(pattern))
                if installer.is_file() and not installer.is_symlink()
            )

    return sorted(installers)


def main() -> int:
    """Find the built installer packages, rename them, and calculate checksums."""
    repo_root = Path(__file__).resolve().parents[2]
    output_dir = repo_root / "artifacts"
    output_dir.mkdir(parents=True, exist_ok=True)

    installers = find_installer_packages(repo_root)
    if not installers:
        raise FileNotFoundError(
            "Could not find any built installers (APP/EXE/MSI) in target/release/bundle/"
        )

    suffix_counts = Counter(path.suffix.lower() for path in installers)
    for installer_path in installers:
        identity = artifact_identity(installer_path.name)
        archive_name = identity["archive_name"]

        if suffix_counts[installer_path.suffix.lower()] > 1:
            archive_base = Path(archive_name)
            archive_name = f"{archive_base.stem}-{archive_safe_stem(installer_path)}{archive_base.suffix}"

        archive_path = output_dir / archive_name
        shutil.copy2(installer_path, archive_path)

        checksum_path = output_dir / f"{archive_name}.sha256"
        checksum_path.write_text(f"{sha256_file(archive_path)}  {archive_name}\n", encoding="utf-8")

        manifest_path = output_dir / (
            f"{archive_name}.manifest.txt"
            if suffix_counts[installer_path.suffix.lower()] > 1
            else identity["manifest_name"]
        )
        manifest_path.write_text(
            "\n".join(
                [
                    f"platform={identity['platform']}",
                    f"arch={identity['arch']}",
                    f"target_triple={os.environ.get('BANDSCOPE_TARGET_TRIPLE', 'native')}",
                    f"original_file={installer_path.name}",
                    f"archive={archive_name}",
                    f"checksum={checksum_path.name}",
                ]
            )
            + "\n",
            encoding="utf-8",
        )

        print(f"Packaged {installer_path.name} to artifacts/{archive_name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
