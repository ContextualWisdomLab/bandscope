"""Versioned commit-marker authority for persisted local-audio feature caches.

A production feature cache lives below the native-verified
``source-sha256-v1/<digest>`` namespace. The manifest binds that source identity
to the exact bounded metadata bytes and the exact private NPZ snapshot bytes.
It is published last, so interrupted replacement leaves either no commit marker
or a marker whose digests no longer match and therefore becomes a cache miss.

SHA-256 is used here for local content identity/integrity. This module does not
claim authenticity, a signature or MAC, FIPS module validation, or tamper-proof
storage against an attacker that can rewrite every cache artifact together.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TypeGuard, TypedDict

from bandscope_analysis.feature_cache_admission import read_bounded_feature_cache_metadata

FEATURE_CACHE_GENERATION_SCHEMA_VERSION = 1
_SOURCE_NAMESPACE = "source-sha256-v1"
_HASH_CHUNK_BYTES = 1024 * 1024


class FeatureCacheGenerationManifest(TypedDict):
    """Commit marker binding one source identity to one metadata/archive generation."""

    schemaVersion: int
    sourceSha256: str
    metadataSha256: str
    archiveSha256: str


def is_sha256_hex(value: object) -> TypeGuard[str]:
    """Return whether a value is one canonical lowercase SHA-256 hex digest."""
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def source_sha256_from_cache_path(path: Path) -> str | None:
    """Recover the nearest native-verified source identity from a cache path."""
    parts = path.parts
    for index in range(len(parts) - 2, -1, -1):
        if parts[index] != _SOURCE_NAMESPACE:
            continue
        candidate = parts[index + 1]
        return candidate if is_sha256_hex(candidate) else None
    return None


def feature_cache_manifest_path(metadata_path: Path) -> Path:
    """Return the last-published commit-marker path beside one feature sidecar."""
    return metadata_path.with_suffix(".manifest.json")


def file_sha256(path: Path) -> str | None:
    """Hash one generated cache artifact without materializing it in memory."""
    try:
        digest = hashlib.sha256()
        with path.open("rb") as cache_file:
            while chunk := cache_file.read(_HASH_CHUNK_BYTES):
                digest.update(chunk)
        return digest.hexdigest()
    except (MemoryError, OSError):
        return None


def build_generation_manifest(
    metadata_path: Path,
    arrays_path: Path,
    source_sha256: str,
) -> FeatureCacheGenerationManifest | None:
    """Build a manifest for staged metadata/archive bytes before publication."""
    if not is_sha256_hex(source_sha256):
        return None
    metadata_sha256 = file_sha256(metadata_path)
    archive_sha256 = file_sha256(arrays_path)
    if metadata_sha256 is None or archive_sha256 is None:
        return None
    return {
        "schemaVersion": FEATURE_CACHE_GENERATION_SCHEMA_VERSION,
        "sourceSha256": source_sha256,
        "metadataSha256": metadata_sha256,
        "archiveSha256": archive_sha256,
    }


def read_generation_manifest(
    metadata_path: Path,
    source_sha256: str,
) -> FeatureCacheGenerationManifest | None:
    """Admit one bounded manifest only when it names the exact source namespace."""
    if not is_sha256_hex(source_sha256):
        return None
    payload = read_bounded_feature_cache_metadata(feature_cache_manifest_path(metadata_path))
    if payload is None:
        return None
    if set(payload) != {
        "schemaVersion",
        "sourceSha256",
        "metadataSha256",
        "archiveSha256",
    }:
        return None
    if payload.get("schemaVersion") != FEATURE_CACHE_GENERATION_SCHEMA_VERSION:
        return None
    if payload.get("sourceSha256") != source_sha256:
        return None
    metadata_sha256 = payload.get("metadataSha256")
    archive_sha256 = payload.get("archiveSha256")
    if not is_sha256_hex(metadata_sha256) or not is_sha256_hex(archive_sha256):
        return None
    return {
        "schemaVersion": FEATURE_CACHE_GENERATION_SCHEMA_VERSION,
        "sourceSha256": source_sha256,
        "metadataSha256": metadata_sha256,
        "archiveSha256": archive_sha256,
    }


__all__ = [
    "FeatureCacheGenerationManifest",
    "build_generation_manifest",
    "feature_cache_manifest_path",
    "read_generation_manifest",
    "source_sha256_from_cache_path",
]
