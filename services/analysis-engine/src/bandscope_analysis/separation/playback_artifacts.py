"""Materialize separated sources as revocable native playback artifacts.

The module converts one complete, aligned Demucs source set into deterministic
mono PCM16 WAV files below an app-owned temporary root. It returns an internal
native manifest for the trusted Tauri boundary; renderer-safe projection and
revocation remain native responsibilities.

Security Notes:
- Model arrays are untrusted until their kind, dtype, rank, size, alignment, and
  finiteness are validated.
- The artifact-set identity is a lowercase SHA-256 token and cannot select an
  arbitrary path.
- Publication uses a same-filesystem staging directory and one directory rename,
  so a failed write does not expose a partial target set.
- Existing artifact identities are reused only when every expected byte hash
  matches; collisions fail closed without replacing prior data.
- The returned native paths must be stripped or rewritten before renderer IPC.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import stat
import tempfile
import wave
from pathlib import Path
from typing import Any, Final, Literal, Mapping, TypedDict, cast

import numpy as np
from numpy.typing import NDArray


PlaybackStemKind = Literal["vocals", "bass", "drums", "other"]
PlaybackStemArray = NDArray[np.floating[Any]]

CANONICAL_PLAYBACK_STEM_KINDS: Final[tuple[PlaybackStemKind, ...]] = (
    "vocals",
    "bass",
    "drums",
    "other",
)
PLAYABLE_STEM_ARTIFACT_VERSION: Final[Literal[1]] = 1
PLAYABLE_STEM_MEDIA_TYPE: Final[Literal["audio/wav"]] = "audio/wav"
MIN_PLAYBACK_SAMPLE_RATE_HZ: Final = 8_000
MAX_PLAYBACK_SAMPLE_RATE_HZ: Final = 192_000
PCM16_MAXIMUM_SAMPLE: Final = 32_767.0
PCM16_NORMALIZED_PEAK: Final = PCM16_MAXIMUM_SAMPLE / 32_768.0
ARTIFACT_SET_ID_PATTERN: Final = re.compile(r"[0-9a-f]{64}\Z")
HASH_READ_CHUNK_BYTES: Final = 1024 * 1024


class NativePlayableStemArtifact(TypedDict):
    """Trusted-process metadata for one generated stem media file."""

    artifactId: str
    stemKind: PlaybackStemKind
    nativeFilePath: str
    fileSizeBytes: int
    contentHashSha256: str
    mediaType: Literal["audio/wav"]
    sampleRate: int
    channelCount: Literal[1]
    sampleCount: int
    durationSeconds: float


class NativePlayableStemArtifactSet(TypedDict):
    """Trusted-process manifest for one complete aligned playback source set."""

    artifactSetId: str
    formatVersion: Literal[1]
    sampleRate: int
    channelCount: Literal[1]
    sampleCount: int
    durationSeconds: float
    appliedGain: float
    stemArtifacts: list[NativePlayableStemArtifact]


def materialize_playable_stem_artifact_set(
    *,
    stem_arrays: Mapping[str, object],
    sample_rate_hz: object,
    artifact_root: str | Path,
    artifact_set_id: str,
) -> NativePlayableStemArtifactSet:
    """Validate and atomically publish one complete PCM16 stem artifact set.

    ``artifact_root`` must already belong to the current BandScope project. The
    function adds only the fixed ``playable-stems-v1/<sha256>`` suffix and never
    accepts a caller-provided filename. It intentionally returns native paths
    for the trusted Tauri process; those paths are not a renderer contract.
    """
    validated_sample_rate = _validate_sample_rate(sample_rate_hz)
    validated_artifact_set_id = _validate_artifact_set_id(artifact_set_id)
    validated_stem_arrays, sample_count, applied_gain = _validate_stem_arrays(stem_arrays)
    version_directory = _prepare_version_directory(Path(artifact_root))
    artifact_directory = version_directory / validated_artifact_set_id
    staging_directory: Path | None = Path(
        tempfile.mkdtemp(prefix=f".{validated_artifact_set_id}.", dir=version_directory)
    )

    try:
        assert staging_directory is not None
        staging_artifacts = _write_staging_artifacts(
            stem_arrays=validated_stem_arrays,
            sample_rate_hz=validated_sample_rate,
            sample_count=sample_count,
            applied_gain=applied_gain,
            staging_directory=staging_directory,
        )
        published_directory = _publish_artifact_directory(
            staging_directory=staging_directory,
            artifact_directory=artifact_directory,
            staging_artifacts=staging_artifacts,
        )
        staging_directory = None
        stem_artifacts = _project_artifacts_to_directory(
            source_artifacts=staging_artifacts,
            artifact_directory=published_directory,
        )
    finally:
        if staging_directory is not None and staging_directory.exists():
            shutil.rmtree(staging_directory, ignore_errors=True)

    return {
        "artifactSetId": validated_artifact_set_id,
        "formatVersion": PLAYABLE_STEM_ARTIFACT_VERSION,
        "sampleRate": validated_sample_rate,
        "channelCount": 1,
        "sampleCount": sample_count,
        "durationSeconds": sample_count / validated_sample_rate,
        "appliedGain": applied_gain,
        "stemArtifacts": stem_artifacts,
    }


def _validate_sample_rate(sample_rate_hz: object) -> int:
    """Return a bounded integer media sample rate or fail closed."""
    if (
        isinstance(sample_rate_hz, bool)
        or not isinstance(sample_rate_hz, int)
        or not MIN_PLAYBACK_SAMPLE_RATE_HZ
        <= sample_rate_hz
        <= MAX_PLAYBACK_SAMPLE_RATE_HZ
    ):
        raise ValueError("Invalid playable stem sample rate.")
    return sample_rate_hz


def _validate_artifact_set_id(artifact_set_id: object) -> str:
    """Return a lowercase SHA-256 artifact-set identifier or fail closed."""
    if not isinstance(artifact_set_id, str) or not ARTIFACT_SET_ID_PATTERN.fullmatch(
        artifact_set_id
    ):
        raise ValueError("Invalid playable stem artifact set identity.")
    return artifact_set_id


def _validate_stem_arrays(
    stem_arrays: Mapping[str, object],
) -> tuple[dict[PlaybackStemKind, PlaybackStemArray], int, float]:
    """Snapshot and validate a complete aligned floating-point source set."""
    if set(stem_arrays) != set(CANONICAL_PLAYBACK_STEM_KINDS):
        raise ValueError("Playable artifacts require the exact canonical stems.")

    validated_stem_arrays: dict[PlaybackStemKind, PlaybackStemArray] = {}
    aligned_sample_count: int | None = None
    maximum_absolute_sample = 0.0
    for stem_kind in CANONICAL_PLAYBACK_STEM_KINDS:
        stem_array = stem_arrays[stem_kind]
        if not isinstance(stem_array, np.ndarray) or not np.issubdtype(
            stem_array.dtype, np.floating
        ):
            raise ValueError(f"Playable stem {stem_kind} must be a floating-point array.")
        if stem_array.ndim != 1:
            raise ValueError(f"Playable stem {stem_kind} must be one-dimensional.")
        if stem_array.size == 0:
            raise ValueError(f"Playable stem {stem_kind} must be non-empty.")
        if not bool(np.isfinite(stem_array).all()):
            raise ValueError(f"Playable stem {stem_kind} must contain only finite samples.")

        current_sample_count = int(stem_array.size)
        if aligned_sample_count is None:
            aligned_sample_count = current_sample_count
        elif current_sample_count != aligned_sample_count:
            raise ValueError("Playable stems must have aligned sample counts.")

        stem_snapshot = cast(PlaybackStemArray, np.asarray(stem_array, dtype=np.float32).copy())
        validated_stem_arrays[stem_kind] = stem_snapshot
        maximum_absolute_sample = max(
            maximum_absolute_sample,
            float(np.max(np.abs(stem_snapshot))),
        )

    assert aligned_sample_count is not None
    applied_gain = (
        1.0
        if maximum_absolute_sample <= PCM16_NORMALIZED_PEAK
        else PCM16_NORMALIZED_PEAK / maximum_absolute_sample
    )
    return validated_stem_arrays, aligned_sample_count, applied_gain


def _prepare_version_directory(artifact_root: Path) -> Path:
    """Create and validate the fixed app-owned artifact version directory."""
    try:
        artifact_root.mkdir(parents=True, exist_ok=True)
    except OSError as root_error:
        raise ValueError("Invalid playable stem artifact root.") from root_error
    _require_plain_directory(artifact_root, "artifact root")

    version_directory = artifact_root / "playable-stems-v1"
    try:
        version_directory.mkdir(exist_ok=True)
    except OSError as version_error:
        raise ValueError("Invalid playable stem artifact root.") from version_error
    _require_plain_directory(version_directory, "artifact root")

    return version_directory.resolve(strict=True)


def _require_plain_directory(directory_path: Path, field_name: str) -> None:
    """Reject symbolic links and non-directory entries at owned path components."""
    try:
        directory_status = directory_path.lstat()
    except OSError as status_error:
        raise ValueError(f"Invalid playable stem {field_name}.") from status_error
    if directory_path.is_symlink() or not stat.S_ISDIR(directory_status.st_mode):
        raise ValueError(f"Invalid playable stem {field_name}.")


def _write_staging_artifacts(
    *,
    stem_arrays: Mapping[PlaybackStemKind, PlaybackStemArray],
    sample_rate_hz: int,
    sample_count: int,
    applied_gain: float,
    staging_directory: Path,
) -> list[NativePlayableStemArtifact]:
    """Write and hash every source inside an unpublished staging directory."""
    staging_artifacts: list[NativePlayableStemArtifact] = []
    try:
        for stem_kind in CANONICAL_PLAYBACK_STEM_KINDS:
            staging_path = staging_directory / f"{stem_kind}.wav"
            pcm_samples = np.rint(
                stem_arrays[stem_kind] * np.float32(applied_gain * PCM16_MAXIMUM_SAMPLE)
            ).astype("<i2")
            with wave.open(str(staging_path), "wb") as wave_writer:
                wave_writer.setnchannels(1)
                wave_writer.setsampwidth(2)
                wave_writer.setframerate(sample_rate_hz)
                wave_writer.writeframes(pcm_samples.tobytes())
            with staging_path.open("rb+") as artifact_file:
                artifact_file.flush()
                os.fsync(artifact_file.fileno())
            file_size_bytes = staging_path.stat().st_size
            staging_artifacts.append(
                {
                    "artifactId": f"stem-{stem_kind}",
                    "stemKind": stem_kind,
                    "nativeFilePath": str(staging_path),
                    "fileSizeBytes": file_size_bytes,
                    "contentHashSha256": _calculate_file_sha256(staging_path),
                    "mediaType": PLAYABLE_STEM_MEDIA_TYPE,
                    "sampleRate": sample_rate_hz,
                    "channelCount": 1,
                    "sampleCount": sample_count,
                    "durationSeconds": sample_count / sample_rate_hz,
                }
            )
    except (OSError, wave.Error, ValueError) as write_error:
        raise ValueError("Could not create playable stem artifacts.") from write_error
    return staging_artifacts


def _publish_artifact_directory(
    *,
    staging_directory: Path,
    artifact_directory: Path,
    staging_artifacts: list[NativePlayableStemArtifact],
) -> Path:
    """Publish a new set atomically or reuse an identical existing set."""
    if artifact_directory.exists() or artifact_directory.is_symlink():
        if _existing_artifacts_match(
            artifact_directory=artifact_directory,
            staging_artifacts=staging_artifacts,
        ):
            shutil.rmtree(staging_directory)
            return artifact_directory
        raise ValueError("Playable stem artifact identity collision.")

    try:
        os.replace(staging_directory, artifact_directory)
    except OSError as publish_error:
        if artifact_directory.exists() and _existing_artifacts_match(
            artifact_directory=artifact_directory,
            staging_artifacts=staging_artifacts,
        ):
            shutil.rmtree(staging_directory)
            return artifact_directory
        raise ValueError("Could not publish playable stem artifacts.") from publish_error
    return artifact_directory


def _existing_artifacts_match(
    *,
    artifact_directory: Path,
    staging_artifacts: list[NativePlayableStemArtifact],
) -> bool:
    """Return whether an existing plain directory exactly matches staged bytes."""
    try:
        _require_plain_directory(artifact_directory, "artifact directory")
        expected_names = {f"{stem_kind}.wav" for stem_kind in CANONICAL_PLAYBACK_STEM_KINDS}
        actual_entries = list(artifact_directory.iterdir())
        if {entry_path.name for entry_path in actual_entries} != expected_names:
            return False
        staged_by_kind = {
            staged_artifact["stemKind"]: staged_artifact
            for staged_artifact in staging_artifacts
        }
        for stem_kind in CANONICAL_PLAYBACK_STEM_KINDS:
            existing_path = artifact_directory / f"{stem_kind}.wav"
            existing_status = existing_path.lstat()
            if existing_path.is_symlink() or not stat.S_ISREG(existing_status.st_mode):
                return False
            staged_artifact = staged_by_kind[stem_kind]
            if existing_status.st_size != staged_artifact["fileSizeBytes"]:
                return False
            if _calculate_file_sha256(existing_path) != staged_artifact["contentHashSha256"]:
                return False
    except (OSError, ValueError):
        return False
    return True


def _project_artifacts_to_directory(
    *,
    source_artifacts: list[NativePlayableStemArtifact],
    artifact_directory: Path,
) -> list[NativePlayableStemArtifact]:
    """Replace staging paths with paths in the atomically published directory."""
    return [
        {
            "artifactId": source_artifact["artifactId"],
            "stemKind": source_artifact["stemKind"],
            "nativeFilePath": str(
                artifact_directory / f'{source_artifact["stemKind"]}.wav'
            ),
            "fileSizeBytes": source_artifact["fileSizeBytes"],
            "contentHashSha256": source_artifact["contentHashSha256"],
            "mediaType": source_artifact["mediaType"],
            "sampleRate": source_artifact["sampleRate"],
            "channelCount": source_artifact["channelCount"],
            "sampleCount": source_artifact["sampleCount"],
            "durationSeconds": source_artifact["durationSeconds"],
        }
        for source_artifact in source_artifacts
    ]


def _calculate_file_sha256(file_path: Path) -> str:
    """Calculate a SHA-256 digest without loading a complete media file in memory."""
    file_digest = hashlib.sha256()
    with file_path.open("rb") as artifact_file:
        while file_chunk := artifact_file.read(HASH_READ_CHUNK_BYTES):
            file_digest.update(file_chunk)
    return file_digest.hexdigest()
