"""Select a strict allowlist of release assets for immutable publication."""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path
from typing import Iterable

TARGET_INSTALLER_SUFFIXES = {
    ("windows", "amd64"): {".exe", ".msi"},
    ("windows", "arm64"): {".exe", ".msi"},
    ("macos", "amd64"): {".dmg"},
    ("macos", "arm64"): {".dmg"},
}
RELEASE_METADATA = [
    Path("bandscope-sbom.cdx.json"),
    Path("supply-chain/supplemental-component-inventory.json"),
]


def _artifact_pattern(git_sha: str) -> re.Pattern[str]:
    """Return the strict artifact filename pattern for a release commit."""
    short_sha = re.escape(git_sha[:12])
    return re.compile(
        rf"^bandscope-(?P<platform>windows|macos)-(?P<arch>amd64|arm64)-{short_sha}"
        r"(?:-[A-Za-z0-9._-]+)?"
        r"(?P<installer_suffix>\.(?:exe|msi|dmg))"
        r"(?P<sidecar>\.sha256|\.manifest\.txt)?$"
    )


def _installer_name_for_artifact(filename: str) -> str:
    """Return the installer archive filename for a sidecar or archive filename."""
    for suffix in [".manifest.txt", ".sha256"]:
        if filename.endswith(suffix):
            return filename[: -len(suffix)]
    return filename


def _ensure_file(path: Path) -> None:
    """Raise if a required release asset path is missing or not a file."""
    if not path.is_file():
        raise ValueError(f"missing release asset: {path.as_posix()}")


def select_release_assets(repo_root: Path, git_sha: str | None = None) -> list[str]:
    """Return release asset paths after rejecting stray or incomplete artifacts.

    The returned paths are relative to ``repo_root`` and safe to pass directly to
    ``gh release create``. Any unexpected file in ``artifacts/`` fails closed so
    public releases cannot accidentally attach debug, cache, or poisoned files.
    """
    effective_sha = (git_sha or os.environ.get("GITHUB_SHA") or "local")[:12]
    artifacts_dir = repo_root / "artifacts"
    if not artifacts_dir.is_dir():
        raise ValueError("missing release artifact directory: artifacts")

    for metadata_path in RELEASE_METADATA:
        _ensure_file(repo_root / metadata_path)

    pattern = _artifact_pattern(effective_sha)
    installers_by_target: dict[tuple[str, str], set[str]] = {
        target: set() for target in TARGET_INSTALLER_SUFFIXES
    }
    sidecars_by_installer: dict[str, set[str]] = {}
    selected_artifacts: list[str] = []

    for artifact_path in sorted(artifacts_dir.iterdir(), key=lambda path: path.name):
        if not artifact_path.is_file():
            raise ValueError(f"unexpected release artifact path: {artifact_path.name}")

        match = pattern.fullmatch(artifact_path.name)
        if match is None:
            raise ValueError(f"unexpected release artifact: {artifact_path.name}")

        platform_name = match.group("platform")
        arch = match.group("arch")
        target = (platform_name, arch)
        installer_suffix = match.group("installer_suffix")
        if installer_suffix not in TARGET_INSTALLER_SUFFIXES[target]:
            raise ValueError(
                f"unexpected installer suffix for {platform_name}-{arch}: {artifact_path.name}"
            )

        installer_name = _installer_name_for_artifact(artifact_path.name)
        sidecar = match.group("sidecar")
        if sidecar is None:
            installers_by_target[target].add(installer_name)
        else:
            sidecars_by_installer.setdefault(installer_name, set()).add(sidecar)
        selected_artifacts.append(f"artifacts/{artifact_path.name}")

    for platform_name, arch in TARGET_INSTALLER_SUFFIXES:
        if not installers_by_target[(platform_name, arch)]:
            raise ValueError(f"missing installer for {platform_name}-{arch}")

    installer_names = set().union(*installers_by_target.values())
    for installer_name in sorted(installer_names):
        sidecars = sidecars_by_installer.get(installer_name, set())
        if ".sha256" not in sidecars:
            raise ValueError(f"missing checksum for {installer_name}")
        if ".manifest.txt" not in sidecars:
            raise ValueError(f"missing manifest for {installer_name}")

    for installer_name in sorted(sidecars_by_installer):
        if installer_name not in installer_names:
            raise ValueError(f"sidecar without installer: {installer_name}")

    return [*sorted(selected_artifacts), *(path.as_posix() for path in RELEASE_METADATA)]


def write_asset_list(output_path: Path, assets: Iterable[str]) -> None:
    """Write release asset paths one per line for workflow consumption."""
    output_path.write_text("\n".join(assets) + "\n", encoding="utf-8")


def main() -> int:
    """Validate release artifacts and write a strict asset list."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        help="Path to write the selected release asset list. Prints to stdout when omitted.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path.cwd(),
        help="Repository root containing artifacts/ and release metadata.",
    )
    parser.add_argument(
        "--git-sha",
        default=os.environ.get("GITHUB_SHA"),
        help="Commit SHA embedded in artifact names. Defaults to GITHUB_SHA.",
    )
    args = parser.parse_args()

    try:
        assets = select_release_assets(args.repo_root, git_sha=args.git_sha)
    except ValueError as exc:
        print(f"Release asset validation failed: {exc}")
        return 1

    if args.output is not None:
        write_asset_list(args.output, assets)
    else:
        print("\n".join(assets))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
