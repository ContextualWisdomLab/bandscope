"""Bounded replay admission for persisted local-audio stem arrays.

The feature cache is a persistence boundary, not trusted in-memory state. A
cached ``npz`` archive is therefore copied from one already-open regular file
into a bounded private snapshot before NumPy may materialize any member. Member
names, NPY headers, sample counts, visible bytes, floating-point representation,
and aggregate archive shape are admitted against the same audio resource budget
used by decode.

Security Notes:
- The cache path is app-owned, but its bytes and metadata are untrusted after a
  crash, local tampering, restore, or partial publication.
- Persisted stem identities are admitted only from the canonical Demucs output
  set (vocals, bass, drums, other); cache metadata cannot invent a new role.
- The persisted metadata sidecar must still be readable at archive admission;
  its second-read schema version, stem identity, and sample rate must match the
  caller's already-admitted metadata. Legacy caches may omit ``stemRoleTypes``
  inside that sidecar, but sidecar disappearance, schema/identity/rate
  replacement, or malformed replacement fails closed.
- Persisted separation duration is required, finite, positive, and must agree
  with the synchronized stem sample timeline within half one sample at the
  admitted sample rate. Metadata cannot omit, stretch, or shrink rehearsal
  timing away from the actual cached stem extent. Exact metadata/archive/source
  generation binding remains a separate persistence contract.
- Persisted role metadata, when present beside the stem archive, must preserve
  the canonical binding: vocals is vocal; bass, drums, and other are instruments.
- The opened archive is copied exactly once into a bounded spooled snapshot.
  ZIP/NPY declaration preflight and NumPy materialization consume that same
  snapshot, so pathname or same-inode rewrites after the copy cannot substitute
  different samples into the already-admitted rehearsal evidence.
- ZIP central-directory declarations and bounded NPY headers are checked before
  ``np.load`` can decompress a stem member. Extra or duplicate members fail
  closed rather than becoming hidden compressed payload.
- Every admitted stem must declare the same non-zero sample count so replay
  preserves the synchronized timeline produced by source separation.
- Each member is one non-empty floating one-dimensional signal within the
  configured sample and visible-byte ceilings. Loaded legacy floating dtypes
  are converted to owned ``float32`` only after those pre-copy bounds pass.
- Canonical finiteness, dtype, sample-rate, sample-count, and memory checks are
  reapplied before a replayed stem can return to MIR/rehearsal analysis.
- Allocator exhaustion or truncated archive state encountered while copying,
  preflighting, or opening an otherwise admitted cache fails closed as a cache
  miss instead of escaping the persistence boundary and crashing the analysis job.
- This creates one immutable replay byte snapshot; it does not bind that snapshot
  cryptographically to the metadata sidecar or admitted source content, and it
  does not claim a process-wide RSS ceiling for NumPy/ZIP or downstream MIR work.
"""

from __future__ import annotations

import json
import math
import os
import stat
import tempfile
import zipfile
from pathlib import Path
from typing import BinaryIO

import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)

_FEATURE_CACHE_SCHEMA_VERSION = 1
_CANONICAL_STEM_ROLE_TYPES = {
    "vocals": "vocal",
    "bass": "instrument",
    "drums": "instrument",
    "other": "instrument",
}
_CANONICAL_STEM_KEYS = frozenset(_CANONICAL_STEM_ROLE_TYPES)
_MAX_STEM_MEMBERS = len(_CANONICAL_STEM_KEYS)
_MAX_NPY_HEADER_BYTES = 16 * 1024
_MAX_ARCHIVE_CONTAINER_OVERHEAD_BYTES = 1024 * 1024
_ARCHIVE_SNAPSHOT_MEMORY_BYTES = 8 * 1024 * 1024
_ARCHIVE_SNAPSHOT_COPY_CHUNK_BYTES = 1024 * 1024
_NPY_VERSION = (1, 0)
_CANONICAL_ITEMSIZE = np.dtype(np.float32).itemsize


def _replay_policy(
    sample_rate: object,
    template: AudioResourcePolicy,
) -> AudioResourcePolicy | None:
    """Derive a bounded replay policy for the cache-declared analysis rate."""
    if isinstance(sample_rate, bool) or not isinstance(sample_rate, int):
        return None
    if (
        sample_rate < template.min_source_sample_rate
        or sample_rate > template.max_source_sample_rate
    ):
        return None
    try:
        max_samples = int(sample_rate * float(template.max_duration_seconds))
        canonical_bytes = max_samples * _CANONICAL_ITEMSIZE
        return AudioResourcePolicy(
            max_encoded_file_bytes=template.max_encoded_file_bytes,
            target_sample_rate=sample_rate,
            max_duration_seconds=template.max_duration_seconds,
            max_decoded_audio_bytes=min(
                template.max_decoded_audio_bytes, canonical_bytes
            ),
            min_source_sample_rate=template.min_source_sample_rate,
            max_source_sample_rate=template.max_source_sample_rate,
            min_source_channels=template.min_source_channels,
            max_source_channels=template.max_source_channels,
        )
    except (OverflowError, ValueError):
        return None


def _expected_member_names(stem_keys: list[str]) -> set[str] | None:
    """Return the exact NPY member set for one bounded canonical stem-key list."""
    if (
        not stem_keys
        or len(stem_keys) > _MAX_STEM_MEMBERS
        or len(set(stem_keys)) != len(stem_keys)
    ):
        return None
    if not all(
        stem_key and stem_key.isidentifier() and stem_key in _CANONICAL_STEM_KEYS
        for stem_key in stem_keys
    ):
        return None
    return {f"stem_{stem_key}.npy" for stem_key in stem_keys}


def _read_canonical_stem_role_metadata(
    arrays_path: Path,
    stem_keys: list[str],
    *,
    expected_sample_rate: object | None = None,
) -> dict[str, object] | None:
    """Return one admitted second-read sidecar snapshot for archive replay."""
    metadata_path = arrays_path.with_suffix(".json")
    try:
        with metadata_path.open("r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(metadata, dict):
        return None
    if metadata.get("schemaVersion") != _FEATURE_CACHE_SCHEMA_VERSION:
        return None
    if metadata.get("stemKeys") != stem_keys:
        return None
    if expected_sample_rate is not None:
        if metadata.get("sampleRate") != expected_sample_rate:
            return None

    separation = metadata.get("separation")
    if not isinstance(separation, dict):
        return None
    duration_seconds = separation.get("duration_seconds")
    if duration_seconds is None or isinstance(duration_seconds, bool):
        return None
    if not isinstance(duration_seconds, (int, float)):
        return None
    try:
        duration_value = float(duration_seconds)
    except (OverflowError, ValueError):
        return None
    if not math.isfinite(duration_value) or duration_value <= 0.0:
        return None

    stem_role_types = metadata.get("stemRoleTypes")
    if stem_role_types is None:
        return metadata
    if not isinstance(stem_role_types, dict):
        return None
    if set(stem_role_types) != set(stem_keys):
        return None
    if not all(
        stem_role_types.get(stem_key) == _CANONICAL_STEM_ROLE_TYPES[stem_key]
        for stem_key in stem_keys
    ):
        return None
    return metadata


def _has_canonical_stem_role_metadata(
    arrays_path: Path,
    stem_keys: list[str],
    *,
    expected_sample_rate: object | None = None,
) -> bool:
    """Reject missing or persisted metadata that contradicts replay semantics."""
    return (
        _read_canonical_stem_role_metadata(
            arrays_path,
            stem_keys,
            expected_sample_rate=expected_sample_rate,
        )
        is not None
    )


def _duration_matches_sample_timeline(
    duration_seconds: object,
    sample_count: int,
    sample_rate: object,
) -> bool:
    """Return whether persisted duration agrees with the stem timeline to half a sample."""
    if duration_seconds is None:
        return True
    if isinstance(duration_seconds, bool) or not isinstance(
        duration_seconds, (int, float)
    ):
        return False
    if (
        isinstance(sample_rate, bool)
        or not isinstance(sample_rate, int)
        or sample_rate <= 0
    ):
        return False
    try:
        duration_value = float(duration_seconds)
    except (OverflowError, ValueError):
        return False
    if not math.isfinite(duration_value) or duration_value <= 0.0:
        return False
    expected_duration = sample_count / sample_rate
    return math.isclose(
        duration_value,
        expected_duration,
        rel_tol=0.0,
        abs_tol=0.5 / sample_rate,
    )


def _copy_exact_archive_snapshot(
    source: BinaryIO,
    destination: BinaryIO,
    byte_count: int,
) -> bool:
    """Copy exactly one admitted archive extent into a private replay snapshot."""
    remaining = byte_count
    while remaining > 0:
        chunk = source.read(min(remaining, _ARCHIVE_SNAPSHOT_COPY_CHUNK_BYTES))
        if not chunk:
            return False
        destination.write(chunk)
        remaining -= len(chunk)
    destination.seek(0)
    return True


def _preflight_npz(
    archive_file: BinaryIO,
    stem_keys: list[str],
    policy: AudioResourcePolicy,
) -> int | None:
    """Return the synchronized sample count after bounded ZIP/NPY declaration admission."""
    expected_names = _expected_member_names(stem_keys)
    if expected_names is None:
        return None
    max_member_bytes = policy.max_decoded_audio_bytes + _MAX_NPY_HEADER_BYTES
    max_total_bytes = len(stem_keys) * max_member_bytes

    try:
        with zipfile.ZipFile(archive_file, mode="r") as archive:
            members = archive.infolist()
            member_names = [member.filename for member in members]
            if (
                len(members) != len(expected_names)
                or set(member_names) != expected_names
            ):
                return None
            if len(member_names) != len(set(member_names)):
                return None

            expected_sample_count: int | None = None
            total_declared_bytes = 0
            for member in members:
                if (
                    member.is_dir()
                    or member.flag_bits & 0x1
                    or member.compress_type != zipfile.ZIP_DEFLATED
                    or member.file_size <= 0
                    or member.file_size > max_member_bytes
                ):
                    return None
                total_declared_bytes += member.file_size
                if total_declared_bytes > max_total_bytes:
                    return None

                with archive.open(member, mode="r") as npy_stream:
                    if np.lib.format.read_magic(npy_stream) != _NPY_VERSION:
                        return None
                    shape, fortran_order, dtype = np.lib.format.read_array_header_1_0(
                        npy_stream,
                        max_header_size=_MAX_NPY_HEADER_BYTES,
                    )
                    if fortran_order or len(shape) != 1 or shape[0] <= 0:
                        return None
                    dtype = np.dtype(dtype)
                    if not np.issubdtype(dtype, np.floating):
                        return None
                    sample_count = int(shape[0])
                    if expected_sample_count is None:
                        expected_sample_count = sample_count
                    elif sample_count != expected_sample_count:
                        return None
                    data_bytes = sample_count * dtype.itemsize
                    if (
                        sample_count > policy.max_decoded_samples
                        or data_bytes > policy.max_decoded_audio_bytes
                        or npy_stream.tell() + data_bytes != member.file_size
                    ):
                        return None
    except (
        EOFError,
        MemoryError,
        OSError,
        ValueError,
        zipfile.BadZipFile,
        zipfile.LargeZipFile,
    ):
        return None
    return expected_sample_count


def load_bounded_stem_archive(
    arrays_path: Path,
    stem_keys: list[str],
    sample_rate: object,
    *,
    policy_template: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> dict[str, NDArray[np.float32]] | None:
    """Load one admitted stem archive and return owned canonical float32 signals."""
    policy = _replay_policy(sample_rate, policy_template)
    expected_names = _expected_member_names(stem_keys)
    replay_metadata = _read_canonical_stem_role_metadata(
        arrays_path,
        stem_keys,
        expected_sample_rate=sample_rate,
    )
    if policy is None or expected_names is None or replay_metadata is None:
        return None

    max_archive_bytes = (
        len(stem_keys) * (policy.max_decoded_audio_bytes + _MAX_NPY_HEADER_BYTES)
        + _MAX_ARCHIVE_CONTAINER_OVERHEAD_BYTES
    )
    try:
        with arrays_path.open("rb") as archive_file:
            file_stat = os.fstat(archive_file.fileno())
            if (
                not stat.S_ISREG(file_stat.st_mode)
                or file_stat.st_size <= 0
                or file_stat.st_size > max_archive_bytes
            ):
                return None
            with tempfile.SpooledTemporaryFile(
                max_size=_ARCHIVE_SNAPSHOT_MEMORY_BYTES,
                mode="w+b",
            ) as snapshot_file:
                if not _copy_exact_archive_snapshot(
                    archive_file,
                    snapshot_file,
                    file_stat.st_size,
                ):
                    return None
                sample_count = _preflight_npz(snapshot_file, stem_keys, policy)
                if sample_count is None:
                    return None
                separation = replay_metadata.get("separation")
                if isinstance(separation, dict):
                    if not _duration_matches_sample_timeline(
                        separation.get("duration_seconds"),
                        sample_count,
                        sample_rate,
                    ):
                        return None
                snapshot_file.seek(0)
                with np.load(
                    snapshot_file,
                    allow_pickle=False,
                    max_header_size=_MAX_NPY_HEADER_BYTES,
                ) as stems_archive:
                    stems: dict[str, NDArray[np.float32]] = {}
                    for stem_key in stem_keys:
                        archive_key = f"stem_{stem_key}"
                        if archive_key not in stems_archive:
                            return None
                        stem_array = stems_archive[archive_key]
                        if not isinstance(stem_array, np.ndarray):
                            return None
                        try:
                            with np.errstate(over="ignore", invalid="ignore"):
                                if (
                                    stem_array.dtype == np.dtype(np.float32)
                                    and stem_array.flags.owndata
                                ):
                                    canonical = stem_array
                                else:
                                    canonical = np.array(
                                        stem_array, dtype=np.float32, copy=True
                                    )
                            validated = policy.validate_decoded_audio(
                                canonical, sample_rate
                            )
                        except (
                            AudioResourcePolicyError,
                            MemoryError,
                            OverflowError,
                            TypeError,
                            ValueError,
                        ):
                            return None
                        stems[stem_key] = validated
    except (EOFError, MemoryError, OSError, ValueError, zipfile.BadZipFile):
        return None
    return stems


__all__ = ["load_bounded_stem_archive"]
