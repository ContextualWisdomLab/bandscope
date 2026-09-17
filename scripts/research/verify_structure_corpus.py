#!/usr/bin/env python3
"""Admit local real-audio corpus material for a frozen BandScope MIR experiment.

The preregistration stores provenance and content digests, never workstation
paths. This tool resolves a local-only manifest, hashes audio and annotation
bytes from opened regular-file descriptors, decodes each audio item through the
registered librosa normalization contract, and emits a path-free receipt with a
SHA-256 identity of the exact mono float32 PCM presented to later analysis.

It does not calculate MIR metrics, choose thresholds, or make a noninferiority
decision. Synthetic audio is suitable for unit tests only; production receipts
require the rights-cleared real-audio corpus named by the preregistration.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import stat
import subprocess
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from types import ModuleType
from typing import Any

MANIFEST_SCHEMA_VERSION = 1
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
_MANIFEST_FIELDS = {"schema_version", "registration_sha256", "tracks"}
_TRACK_FIELDS = {"track_id", "audio_path", "annotation_path"}
_RUNTIME_IDENTITY_FIELDS = (
    "source_commit",
    "uv_lock_sha256",
    "python_version",
    "librosa_version",
    "numpy_version",
)
_HEX_RUNTIME_IDENTITY_FIELDS = {"source_commit", "uv_lock_sha256"}


def _load_validator() -> ModuleType:
    path = Path(__file__).with_name("validate_structure_noninferiority.py")
    spec = importlib.util.spec_from_file_location("structure_noninferiority_validator", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load structure noninferiority validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _sequence(value: object, field: str) -> Sequence[Any]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        raise ValueError(f"{field} must be an array")
    return value


def _exact_fields(value: Mapping[str, Any], expected: set[str], field: str) -> None:
    missing = sorted(expected - set(value))
    extra = sorted(set(value) - expected)
    if missing:
        raise ValueError(f"{field} missing required field: {missing[0]}")
    if extra:
        raise ValueError(f"{field} contains unregistered field: {extra[0]}")


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    return value.strip()


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-standard JSON number is not allowed: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _load_json(path: Path) -> Mapping[str, Any]:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise ValueError("manifest JSON could not be stat'ed") from exc
    if size > MAX_MANIFEST_BYTES:
        raise ValueError(f"manifest JSON exceeds {MAX_MANIFEST_BYTES} bytes")
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError("manifest JSON must be readable UTF-8") from exc
    value = json.loads(
        text,
        object_pairs_hook=_unique_object,
        parse_constant=_reject_constant,
    )
    return _mapping(value, str(path))


def _sha256_file_descriptor(fd: int) -> str:
    digest = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    while True:
        chunk = os.read(fd, 1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(fd, 0, os.SEEK_SET)
    return digest.hexdigest()


def _open_regular_file(path: Path, field: str) -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise ValueError(f"{field} could not be opened as a regular file") from exc
    try:
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError(f"{field} must reference a regular file")
        if not hasattr(os, "O_NOFOLLOW") and path.is_symlink():
            raise ValueError(f"{field} must not be a symbolic link")
        return fd
    except Exception:
        os.close(fd)
        raise


def _decode_pcm_identity(fd: int, target_sample_rate_hz: int) -> tuple[str, int]:
    """Decode from the admitted descriptor and hash canonical mono float32 PCM."""
    import librosa
    import numpy as np

    os.lseek(fd, 0, os.SEEK_SET)
    duplicate_fd = os.dup(fd)
    try:
        with os.fdopen(duplicate_fd, "rb", closefd=True) as fileobj:
            samples, actual_sample_rate_hz = librosa.load(
                fileobj,
                sr=target_sample_rate_hz,
                mono=True,
            )
    except Exception:
        try:
            os.close(duplicate_fd)
        except OSError:
            pass
        raise
    if int(actual_sample_rate_hz) != target_sample_rate_hz:
        raise ValueError("decoder did not honor the registered sample rate")
    canonical = np.asarray(samples, dtype="<f4", order="C")
    if canonical.ndim != 1 or canonical.size == 0:
        raise ValueError("decoded audio must be non-empty mono PCM")
    return hashlib.sha256(canonical.tobytes(order="C")).hexdigest(), int(canonical.size)


def _current_runtime_identity(repo_root: Path) -> dict[str, object]:
    import librosa
    import numpy as np

    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if completed.returncode != 0:
        raise RuntimeError("git rev-parse HEAD failed")
    lock_path = repo_root / "uv.lock"
    with lock_path.open("rb") as lock_file:
        lock_digest = hashlib.file_digest(lock_file, "sha256").hexdigest()
    return {
        "source_commit": completed.stdout.strip(),
        "uv_lock_sha256": lock_digest,
        "python_version": platform.python_version(),
        "librosa_version": str(librosa.__version__),
        "numpy_version": str(np.__version__),
    }


def _validate_runtime_identity(
    registration: Mapping[str, Any], runtime_identity: Mapping[str, object]
) -> dict[str, str]:
    runtime = _mapping(registration.get("runtime"), "registration.runtime")
    normalized: dict[str, str] = {}
    for field in _RUNTIME_IDENTITY_FIELDS:
        actual = _text(runtime_identity.get(field), f"runtime_identity.{field}")
        expected = _text(runtime.get(field), f"registration.runtime.{field}")
        if field in _HEX_RUNTIME_IDENTITY_FIELDS:
            actual = actual.lower()
            expected = expected.lower()
        if actual != expected:
            raise ValueError(
                f"runtime identity mismatch for {field}: expected {expected}, got {actual}"
            )
        normalized[field] = actual
    return normalized


def verify_corpus(
    registration: Mapping[str, Any],
    manifest: Mapping[str, Any],
    *,
    runtime_identity: Mapping[str, object],
    decoder: Callable[[int, int], tuple[str, int]] = _decode_pcm_identity,
) -> dict[str, object]:
    """Verify local files and return a path-free decoded-corpus receipt."""
    validator = _load_validator()
    validator.validate_registration(registration)
    registration_sha256 = validator.registration_digest(registration)

    _exact_fields(manifest, _MANIFEST_FIELDS, "manifest")
    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ValueError(f"manifest.schema_version must equal {MANIFEST_SCHEMA_VERSION}")
    manifest_digest = _text(manifest.get("registration_sha256"), "manifest.registration_sha256")
    if manifest_digest != registration_sha256:
        raise ValueError("manifest.registration_sha256 does not match registration")
    normalized_runtime = _validate_runtime_identity(registration, runtime_identity)

    corpus = _sequence(registration.get("corpus"), "registration.corpus")
    corpus_by_id: dict[str, Mapping[str, Any]] = {}
    corpus_ids: list[str] = []
    for index, raw_track in enumerate(corpus):
        track = _mapping(raw_track, f"registration.corpus[{index}]")
        track_id = _text(track.get("track_id"), f"registration.corpus[{index}].track_id")
        corpus_by_id[track_id] = track
        corpus_ids.append(track_id)

    manifest_tracks = _sequence(manifest.get("tracks"), "manifest.tracks")
    if len(manifest_tracks) != len(corpus_ids):
        raise ValueError("manifest.tracks must contain exactly the registered corpus")

    seen: set[str] = set()
    receipt_tracks: list[dict[str, object]] = []
    target_sample_rate_hz = int(_mapping(registration["runtime"], "runtime")["sample_rate_hz"])
    for index, raw_track in enumerate(manifest_tracks):
        field = f"manifest.tracks[{index}]"
        track = _mapping(raw_track, field)
        _exact_fields(track, _TRACK_FIELDS, field)
        track_id = _text(track.get("track_id"), f"{field}.track_id")
        if track_id in seen:
            raise ValueError(f"duplicate manifest track_id: {track_id}")
        seen.add(track_id)
        if index >= len(corpus_ids) or track_id != corpus_ids[index]:
            raise ValueError("manifest track order must exactly match registration corpus order")
        registered = corpus_by_id[track_id]

        audio_path = Path(_text(track.get("audio_path"), f"{field}.audio_path"))
        annotation_path = Path(_text(track.get("annotation_path"), f"{field}.annotation_path"))
        audio_fd = _open_regular_file(audio_path, f"{field}.audio_path")
        try:
            audio_sha256 = _sha256_file_descriptor(audio_fd)
            expected_audio = _text(
                registered.get("audio_sha256"), "registered.audio_sha256"
            ).lower()
            if audio_sha256 != expected_audio:
                raise ValueError(f"{field}.audio_path SHA-256 does not match registration")
            decoded_pcm_sha256, decoded_frames = decoder(audio_fd, target_sample_rate_hz)
        finally:
            os.close(audio_fd)

        annotation_fd = _open_regular_file(annotation_path, f"{field}.annotation_path")
        try:
            annotation_sha256 = _sha256_file_descriptor(annotation_fd)
        finally:
            os.close(annotation_fd)
        expected_annotation = _text(
            registered.get("annotation_sha256"), "registered.annotation_sha256"
        ).lower()
        if annotation_sha256 != expected_annotation:
            raise ValueError(f"{field}.annotation_path SHA-256 does not match registration")

        receipt_tracks.append(
            {
                "track_id": track_id,
                "audio_sha256": audio_sha256,
                "annotation_sha256": annotation_sha256,
                "decoded_pcm_sha256": decoded_pcm_sha256,
                "decoded_frames": decoded_frames,
                "sample_rate_hz": target_sample_rate_hz,
                "channels": 1,
            }
        )

    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "registration_sha256": registration_sha256,
        "runtime_identity": normalized_runtime,
        "tracks": receipt_tracks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Admit local real-audio files for a frozen structure experiment"
    )
    parser.add_argument("registration", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    validator = _load_validator()
    registration = _mapping(validator._load_json(args.registration), "registration")
    manifest = _load_json(args.manifest)
    repo_root = Path(__file__).resolve().parents[2]
    receipt = verify_corpus(
        registration,
        manifest,
        runtime_identity=_current_runtime_identity(repo_root),
    )
    args.output.write_text(
        json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
