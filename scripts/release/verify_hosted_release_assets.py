#!/usr/bin/env python3
"""Verify downloaded hosted release assets against the admitted local upload set.

Security Notes:
    GitHub release downloads are untrusted publication evidence. This verifier
    accepts only an explicit bounded list of repository-relative local assets,
    maps each to one unique hosted basename, rejects links/directories/extra
    downloads, and compares size plus streaming SHA-256 from stable regular-file
    descriptors. It does not authenticate GitHub itself or replace platform/
    updater signature verification; it proves only that the bytes downloaded
    from the release asset namespace equal the bytes admitted for upload.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import stat
import sys
from pathlib import Path, PurePosixPath

_MAX_ASSET_LIST_BYTES = 256 * 1024
_MAX_ASSET_COUNT = 256


def _stable_identity(path: Path, *, label: str) -> tuple[int, str]:
    """Return stable byte size and SHA-256 for one regular non-link file."""
    if path.is_symlink():
        raise ValueError(f"{label} must be a regular non-link file")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise ValueError(f"{label} could not be opened") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular non-link file")
        digest = hashlib.sha256()
        size = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
        ) or size != before.st_size:
            raise ValueError(f"{label} changed while being hashed")
        return size, digest.hexdigest()
    finally:
        os.close(descriptor)


def _read_asset_list(path: Path) -> list[str]:
    """Read a bounded unique list of safe repository-relative upload paths."""
    size, _ = _stable_identity(path, label="release asset list")
    if size < 1 or size > _MAX_ASSET_LIST_BYTES:
        raise ValueError("release asset list size is outside policy")
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeError) as error:
        raise ValueError("release asset list must be readable UTF-8") from error
    if len(raw) != size:
        raise ValueError("release asset list changed while being read")

    members: list[str] = []
    seen_paths: set[str] = set()
    seen_basenames: set[str] = set()
    for line in text.splitlines():
        member = line.strip()
        if not member:
            continue
        posix = PurePosixPath(member)
        if (
            posix.is_absolute()
            or member != posix.as_posix()
            or any(part in {"", ".", ".."} for part in posix.parts)
        ):
            raise ValueError("release asset list contains an unsafe path")
        basename = posix.name
        if member in seen_paths or basename in seen_basenames:
            raise ValueError("release asset list contains duplicate publication authority")
        seen_paths.add(member)
        seen_basenames.add(basename)
        members.append(member)
        if len(members) > _MAX_ASSET_COUNT:
            raise ValueError("release asset list exceeds bounded member count")
    if not members:
        raise ValueError("release asset list must not be empty")
    return members


def _hosted_asset_names(hosted_root: Path) -> set[str]:
    """Return the exact flat set downloaded from the release asset namespace."""
    if hosted_root.is_symlink() or not hosted_root.is_dir():
        raise ValueError("hosted release root must be a regular directory")
    names: set[str] = set()
    for path in hosted_root.iterdir():
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"unexpected hosted release path: {path.name}")
        if path.name in names:
            raise ValueError("hosted release asset set contains duplicate names")
        names.add(path.name)
        if len(names) > _MAX_ASSET_COUNT:
            raise ValueError("hosted release asset set exceeds bounded member count")
    return names


def verify_hosted_assets(
    local_root: Path,
    hosted_root: Path,
    asset_list: Path,
) -> None:
    """Require exact name, size, and digest parity for every uploaded release asset."""
    members = _read_asset_list(asset_list)
    expected_names = {PurePosixPath(member).name for member in members}
    hosted_names = _hosted_asset_names(hosted_root)
    if hosted_names != expected_names:
        missing = sorted(expected_names - hosted_names)
        unexpected = sorted(hosted_names - expected_names)
        raise ValueError(
            f"hosted release asset set mismatch; missing={missing}, unexpected={unexpected}"
        )

    for member in members:
        basename = PurePosixPath(member).name
        local_size, local_digest = _stable_identity(
            local_root / Path(*PurePosixPath(member).parts),
            label=f"local release asset {member}",
        )
        hosted_size, hosted_digest = _stable_identity(
            hosted_root / basename,
            label=f"hosted release asset {basename}",
        )
        if hosted_size != local_size:
            raise ValueError(f"hosted release asset size mismatch: {basename}")
        if hosted_digest != local_digest:
            raise ValueError(f"hosted release asset digest mismatch: {basename}")


def main() -> int:
    """CLI entry point for draft/final hosted release byte re-verification."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-root", type=Path, default=Path.cwd())
    parser.add_argument("--hosted-root", type=Path, required=True)
    parser.add_argument("--asset-list", type=Path, required=True)
    args = parser.parse_args()
    try:
        verify_hosted_assets(args.local_root, args.hosted_root, args.asset_list)
    except (OSError, ValueError) as error:
        print(f"Hosted release verification failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
