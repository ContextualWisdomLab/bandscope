"""Safely extract the OSSF Scorecard SARIF artifact downloaded as a ZIP."""

from __future__ import annotations

import argparse
import os
import stat
import zipfile
from pathlib import Path
from typing import IO

EXPECTED_MEMBER = "results.sarif"
MAX_SARIF_BYTES = 10 * 1024 * 1024
READ_CHUNK_BYTES = 64 * 1024


def resolve_artifact_zip(source: Path) -> Path:
    """Return the artifact ZIP file from a file path or single-ZIP directory."""
    if source.is_file():
        ensure_non_symlink_path(source, path_kind="artifact path")
        return source
    if not source.is_dir():
        raise ValueError(f"artifact source does not exist: {source}")
    ensure_non_symlink_path(source, path_kind="artifact path")
    candidates: list[Path] = []
    for path in sorted(candidate for candidate in source.iterdir() if candidate.suffix == ".zip"):
        ensure_non_symlink_path(path, path_kind="artifact path")
        candidates.append(path)
    if len(candidates) != 1:
        raise ValueError(
            f"expected exactly one Scorecard artifact zip in {source}, found {len(candidates)}"
        )
    return candidates[0]


def validate_member(member: zipfile.ZipInfo) -> None:
    """Reject unexpected or unsafe ZIP members."""
    member_path = Path(member.filename)
    unix_mode = member.external_attr >> 16
    if (
        member.filename != EXPECTED_MEMBER
        or member_path.is_absolute()
        or ".." in member.filename.replace("\\", "/").split("/")
        or member.is_dir()
        or stat.S_ISLNK(unix_mode)
    ):
        raise ValueError(f"unexpected artifact member: {member.filename}")
    if member.file_size > MAX_SARIF_BYTES:
        raise ValueError(f"artifact member too large: {member.filename}")


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


def write_new_file_without_following_symlinks(target: Path, source_file: IO[bytes]) -> None:
    """Stream-write to a new file without following an existing symlink."""
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(target, flags, 0o600)
    written = 0
    try:
        with os.fdopen(fd, "wb") as target_file:
            while chunk := source_file.read(READ_CHUNK_BYTES):
                written += len(chunk)
                if written > MAX_SARIF_BYTES:
                    raise ValueError("artifact member too large")
                target_file.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise


def extract_scorecard_artifact(source: Path, output_dir: Path) -> Path:
    """Extract exactly ``results.sarif`` into ``output_dir`` and return its path."""
    artifact_zip = resolve_artifact_zip(source)
    with zipfile.ZipFile(artifact_zip) as archive:
        members = archive.infolist()
        for member in members:
            validate_member(member)
        if [member.filename for member in members] != [EXPECTED_MEMBER]:
            raise ValueError("expected only results.sarif in Scorecard artifact")
        member = members[0]
        ensure_non_symlink_path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        ensure_non_symlink_path(output_dir)
        target = output_dir / EXPECTED_MEMBER
        with archive.open(member) as source_file:
            write_new_file_without_following_symlinks(target, source_file)
        return target


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Safely extract a zipped OSSF Scorecard SARIF artifact."
    )
    parser.add_argument(
        "source",
        type=Path,
        help="Artifact ZIP file or directory containing exactly one artifact ZIP",
    )
    parser.add_argument("output_dir", type=Path, help="Directory for results.sarif")
    return parser.parse_args()


def main() -> None:
    """Run the extractor from the command line."""
    args = parse_args()
    extracted = extract_scorecard_artifact(args.source, args.output_dir)
    print(f"Extracted OSSF Scorecard SARIF to {extracted}")


if __name__ == "__main__":
    main()
