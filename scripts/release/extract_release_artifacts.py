"""Safely extract zipped release artifacts downloaded by GitHub Actions."""

from __future__ import annotations

import argparse
import os
import re
import stat
import zipfile
from pathlib import Path
from typing import IO

RELEASE_MEMBER = re.compile(
    r"^bandscope-(?:windows|macos)-(?:amd64|arm64)-[0-9a-f]{12}"
    r"\.(?:exe|msi|dmg)(?:\.sha256|\.manifest\.txt)?$"
)
MAX_RELEASE_ARTIFACT_BYTES = 512 * 1024 * 1024
MAX_TOTAL_RELEASE_ARTIFACT_BYTES = 4 * 1024 * 1024 * 1024
MAX_RELEASE_ARTIFACT_FILES = 24
READ_CHUNK_BYTES = 64 * 1024


def ensure_non_symlink_path(path: Path, *, path_kind: str = "output path") -> None:
    """Raise when any existing component in ``path`` is a symlink."""
    absolute_path = path.absolute()
    existing_components = [absolute_path]
    existing_components.extend(absolute_path.parents)
    for component in reversed(existing_components):
        try:
            metadata = os.lstat(component)
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError(f"symlinked {path_kind} is not allowed: {component}")


def artifact_zip_paths(source: Path) -> list[Path]:
    """Return non-symlink ZIP files from an artifact path or directory."""
    if source.is_file():
        ensure_non_symlink_path(source, path_kind="artifact path")
        if source.suffix != ".zip":
            raise ValueError(f"expected a release artifact zip: {source}")
        return [source]
    if not source.is_dir():
        raise ValueError(f"artifact source does not exist: {source}")
    ensure_non_symlink_path(source, path_kind="artifact path")
    candidates: list[Path] = []
    for path in sorted(
        candidate for candidate in source.iterdir() if candidate.suffix == ".zip"
    ):
        ensure_non_symlink_path(path, path_kind="artifact path")
        candidates.append(path)
    if not candidates:
        raise ValueError(f"expected at least one release artifact zip in {source}")
    return candidates


def validate_member(member: zipfile.ZipInfo) -> None:
    """Reject unexpected or unsafe ZIP members."""
    member_path = Path(member.filename)
    unix_mode = member.external_attr >> 16
    if (
        RELEASE_MEMBER.fullmatch(member.filename) is None
        or member_path.is_absolute()
        or ".." in member.filename.replace("\\", "/").split("/")
        or member.is_dir()
        or stat.S_ISLNK(unix_mode)
    ):
        raise ValueError(f"unexpected release artifact member: {member.filename}")
    if member.file_size > MAX_RELEASE_ARTIFACT_BYTES:
        raise ValueError(f"release artifact member too large: {member.filename}")


def write_new_file_without_following_symlinks(
    target: Path, source_file: IO[bytes]
) -> None:
    """Stream-write to a new file without following an existing symlink."""
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(target, flags, 0o600)
    try:
        with os.fdopen(fd, "wb") as target_file:
            written = 0
            while chunk := source_file.read(READ_CHUNK_BYTES):
                written += len(chunk)
                if written > MAX_RELEASE_ARTIFACT_BYTES:
                    raise ValueError("release artifact member too large")
                target_file.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise


def extract_release_artifacts(source: Path, output_dir: Path) -> list[Path]:
    """Extract allowlisted release artifact files from downloaded ZIP artifacts."""
    ensure_non_symlink_path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ensure_non_symlink_path(output_dir)

    extracted: list[Path] = []
    seen: set[str] = set()
    total_bytes = 0
    for artifact_zip in artifact_zip_paths(source):
        with zipfile.ZipFile(artifact_zip) as archive:
            members = archive.infolist()
            if not members:
                raise ValueError(f"empty release artifact zip: {artifact_zip}")
            for member in members:
                validate_member(member)
                if len(seen) >= MAX_RELEASE_ARTIFACT_FILES:
                    raise ValueError("too many release artifact files")
                total_bytes += member.file_size
                if total_bytes > MAX_TOTAL_RELEASE_ARTIFACT_BYTES:
                    raise ValueError("release artifact bundle too large")
                if member.filename in seen:
                    raise ValueError(
                        f"duplicate release artifact member: {member.filename}"
                    )
                seen.add(member.filename)
                target = output_dir / member.filename
                with archive.open(member) as source_file:
                    write_new_file_without_following_symlinks(target, source_file)
                extracted.append(target)
    return sorted(extracted)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Safely extract zipped BandScope release artifacts."
    )
    parser.add_argument(
        "source",
        type=Path,
        help="Artifact ZIP file or directory containing release artifact ZIPs",
    )
    parser.add_argument("output_dir", type=Path, help="Directory for release artifacts")
    return parser.parse_args()


def main() -> None:
    """Run the extractor from the command line."""
    args = parse_args()
    extracted = extract_release_artifacts(args.source, args.output_dir)
    print(f"Extracted {len(extracted)} release artifact files to {args.output_dir}")


if __name__ == "__main__":
    main()
