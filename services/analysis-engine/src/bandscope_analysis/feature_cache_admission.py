"""Bounded replay admission for persisted local-audio stem arrays.

The feature cache is a persistence boundary, not trusted in-memory state. A
cached ``npz`` archive is therefore inspected through one already-open regular
file before NumPy may materialize any member. Member names, NPY headers, sample
counts, visible bytes, floating-point representation, and aggregate archive
shape are admitted against the same audio resource budget used by decode.

Security Notes:
- The cache path is app-owned, but its bytes and metadata are untrusted after a
  crash, local tampering, restore, or partial publication.
- Persisted stem identities are admitted only from the canonical Demucs output
  set (vocals, bass, drums, other); cache metadata cannot invent a new role.
- The persisted metadata sidecar must still be readable at archive admission;
  legacy caches may omit ``stemRoleTypes`` inside that sidecar, but sidecar
  disappearance or malformed replacement fails closed.
- Persisted role metadata, when present beside the stem archive, must preserve
  the canonical binding: vocals is vocal; bass, drums, and other are instruments.
- ZIP central-directory declarations and bounded NPY headers are checked before
  ``np.load`` can decompress a stem member. Extra or duplicate members fail
  closed rather than becoming hidden compressed payload.
- Each member is one non-empty floating one-dimensional signal within the
  configured sample and visible-byte ceilings. Loaded legacy floating dtypes
  are converted to owned ``float32`` only after those pre-copy bounds pass.
- Canonical finiteness, dtype, sample-rate, sample-count, and memory checks are
  reapplied before a replayed stem can return to MIR/rehearsal analysis.
- This bounds cache-member materialization; it does not claim a process-wide RSS
  ceiling for NumPy/ZIP internals or downstream MIR/model work.
"""

from __future__ import annotations

import json
import os
import stat
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
            max_decoded_audio_bytes=min(template.max_decoded_audio_bytes, canonical_bytes),
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


def _has_canonical_stem_role_metadata(arrays_path: Path, stem_keys: list[str]) -> bool:
    """Reject missing or persisted role metadata that contradicts canonical semantics."""
    metadata_path = arrays_path.with_suffix(".json")
    try:
        with metadata_path.open("r", encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(metadata, dict):
        return False
    stem_role_types = metadata.get("stemRoleTypes")
    if stem_role_types is None:
        return True
    if not isinstance(stem_role_types, dict):
        return False
    return all(
        stem_role_types.get(stem_key) == _CANONICAL_STEM_ROLE_TYPES[stem_key]
        for stem_key in stem_keys
    )


def _preflight_npz(
    archive_file: BinaryIO,
    stem_keys: list[str],
    policy: AudioResourcePolicy,
) -> bool:
    """Inspect ZIP and NPY declarations before any cached sample array is materialized."""
    expected_names = _expected_member_names(stem_keys)
    if expected_names is None:
        return False
    max_member_bytes = policy.max_decoded_audio_bytes + _MAX_NPY_HEADER_BYTES
    max_total_bytes = len(stem_keys) * max_member_bytes

    try:
        with zipfile.ZipFile(archive_file, mode="r") as archive:
            members = archive.infolist()
            member_names = [member.filename for member in members]
            if len(members) != len(expected_names) or set(member_names) != expected_names:
                return False
            if len(member_names) != len(set(member_names)):
                return False

            total_declared_bytes = 0
            for member in members:
                if (
                    member.is_dir()
                    or member.flag_bits & 0x1
                    or member.compress_type != zipfile.ZIP_DEFLATED
                    or member.file_size <= 0
                    or member.file_size > max_member_bytes
                ):
                    return False
                total_declared_bytes += member.file_size
                if total_declared_bytes > max_total_bytes:
                    return False

                with archive.open(member, mode="r") as npy_stream:
                    if np.lib.format.read_magic(npy_stream) != _NPY_VERSION:
                        return False
                    shape, fortran_order, dtype = np.lib.format.read_array_header_1_0(
                        npy_stream,
                        max_header_size=_MAX_NPY_HEADER_BYTES,
                    )
                    if fortran_order or len(shape) != 1 or shape[0] <= 0:
                        return False
                    dtype = np.dtype(dtype)
                    if not np.issubdtype(dtype, np.floating):
                        return False
                    sample_count = int(shape[0])
                    data_bytes = sample_count * dtype.itemsize
                    if (
                        sample_count > policy.max_decoded_samples
                        or data_bytes > policy.max_decoded_audio_bytes
                        or npy_stream.tell() + data_bytes != member.file_size
                    ):
                        return False
    except (EOFError, OSError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile):
        return False
    return True


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
    if (
        policy is None
        or expected_names is None
        or not _has_canonical_stem_role_metadata(arrays_path, stem_keys)
    ):
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
            if not _preflight_npz(archive_file, stem_keys, policy):
                return None
            archive_file.seek(0)
            with np.load(
                archive_file,
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
                                canonical = np.array(stem_array, dtype=np.float32, copy=True)
                        validated = policy.validate_decoded_audio(canonical, sample_rate)
                    except (
                        AudioResourcePolicyError,
                        MemoryError,
                        OverflowError,
                        TypeError,
                        ValueError,
                    ):
                        return None
                    stems[stem_key] = validated
    except (OSError, ValueError, zipfile.BadZipFile):
        return None
    return stems


__all__ = ["load_bounded_stem_archive"]
