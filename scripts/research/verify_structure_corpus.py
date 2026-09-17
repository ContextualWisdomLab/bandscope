#!/usr/bin/env python3
"""Admit local real-audio corpus material for a frozen BandScope MIR experiment.

The preregistration stores provenance and content digests, never workstation
paths. This tool resolves a local-only manifest, snapshots and hashes audio
bytes from opened regular-file descriptors, hashes annotation bytes from their
opened descriptors, decodes each immutable audio snapshot through the
registered librosa normalization contract, and emits a path-free receipt with a
SHA-256 identity of the exact mono float32 PCM presented to later analysis.

An in-process track consumer may receive that exact normalized PCM together
with an immutable read-only view of the admitted annotation bytes. This is the
handoff boundary for a later MIR experiment runner: the runner must not reopen
workstation source paths after admission merely because the durable receipt
contains only digests, and it must not be able to mutate measurement inputs
before calculating metrics.

The tool does not calculate MIR metrics, choose thresholds, or make a
noninferiority decision. Synthetic audio is suitable for unit tests only;
production receipts require the rights-cleared real-audio corpus named by the
preregistration.
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
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from types import ModuleType
from typing import Any, BinaryIO

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
    """Load one bounded manifest from the same opened regular-file descriptor."""
    fd = _open_regular_file(path, "manifest JSON")
    try:
        metadata = os.fstat(fd)
        if metadata.st_size > MAX_MANIFEST_BYTES:
            raise ValueError(f"manifest JSON exceeds {MAX_MANIFEST_BYTES} bytes")
        os.lseek(fd, 0, os.SEEK_SET)
        chunks: list[bytes] = []
        remaining = MAX_MANIFEST_BYTES + 1
        while remaining > 0:
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        payload = b"".join(chunks)
    finally:
        os.close(fd)

    if len(payload) > MAX_MANIFEST_BYTES:
        raise ValueError(f"manifest JSON exceeds {MAX_MANIFEST_BYTES} bytes")
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("manifest JSON must be readable UTF-8") from exc
    value = json.loads(
        text,
        object_pairs_hook=_unique_object,
        parse_constant=_reject_constant,
    )
    return _mapping(value, "manifest JSON")


def _snapshot_and_hash(fd: int) -> tuple[BinaryIO, str]:
    """Copy one opened source into a process-owned snapshot while hashing it."""
    digest = hashlib.sha256()
    snapshot = tempfile.TemporaryFile(mode="w+b")
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            snapshot.write(chunk)
        snapshot.flush()
        snapshot.seek(0)
        os.lseek(fd, 0, os.SEEK_SET)
        return snapshot, digest.hexdigest()
    except Exception:
        snapshot.close()
        raise


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


def _decode_pcm_identity(fd: int, target_sample_rate_hz: int) -> tuple[str, int, memoryview]:
    """Decode the admitted snapshot and expose canonical read-only mono float32 PCM."""
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
    canonical.setflags(write=False)
    pcm = memoryview(canonical).cast("B")
    return hashlib.sha256(pcm).hexdigest(), int(canonical.size), pcm


def _bind_decoded_pcm(
    decoded_pcm_sha256: object,
    decoded_frames: object,
    decoded_pcm: memoryview,
) -> tuple[str, int, memoryview]:
    """Bind receipt identity to an immutable copy of the exact PCM handoff."""
    pcm_bytes = bytes(decoded_pcm)
    pcm_view = memoryview(pcm_bytes)
    actual_digest = hashlib.sha256(pcm_view).hexdigest()
    claimed_digest = _text(decoded_pcm_sha256, "decoder.decoded_pcm_sha256").lower()
    if actual_digest != claimed_digest:
        raise ValueError("decoded PCM SHA-256 does not match decoder handoff bytes")
    try:
        frame_count = int(decoded_frames)
    except (TypeError, ValueError) as exc:
        raise ValueError("decoded frame count must be an integer") from exc
    if frame_count < 1 or len(pcm_view) != frame_count * 4:
        raise ValueError("decoded frame count does not match mono float32 PCM bytes")
    return actual_digest, frame_count, pcm_view


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

    status = subprocess.run(
        [
            "git",
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--ignore-submodules=none",
        ],
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if status.returncode != 0:
        raise RuntimeError("git status --porcelain failed")
    if status.stdout.strip():
        raise RuntimeError(
            "git working tree must be clean for registered source identity"
        )

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
    decoder: Callable[
        [int, int],
        tuple[str, int] | tuple[str, int, memoryview],
    ] = _decode_pcm_identity,
    track_consumer: Callable[[str, memoryview, memoryview, int], None] | None = None,
) -> dict[str, object]:
    """Verify local files and return a path-free decoded-corpus receipt.

    When ``track_consumer`` is supplied, it runs only after both registered
    content identities are verified. It receives an immutable bytes-backed copy
    of the exact canonical PCM whose digest/frame count enter the receipt plus a
    read-only view over immutable annotation bytes. Neither measurement input can
    be changed through the consumer boundary.
    """
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
            snapshot, audio_sha256 = _snapshot_and_hash(audio_fd)
            try:
                expected_audio = _text(
                    registered.get("audio_sha256"), "registered.audio_sha256"
                ).lower()
                if audio_sha256 != expected_audio:
                    raise ValueError(f"{field}.audio_path SHA-256 does not match registration")
                decoded = decoder(snapshot.fileno(), target_sample_rate_hz)
                decoded_pcm_sha256, decoded_frames = decoded[:2]
                decoded_pcm = decoded[2] if len(decoded) == 3 else None
                if decoded_pcm is not None:
                    decoded_pcm_sha256, decoded_frames, decoded_pcm = _bind_decoded_pcm(
                        decoded_pcm_sha256,
                        decoded_frames,
                        decoded_pcm,
                    )
            finally:
                snapshot.close()
        finally:
            os.close(audio_fd)

        annotation_fd = _open_regular_file(annotation_path, f"{field}.annotation_path")
        try:
            annotation_snapshot, annotation_sha256 = _snapshot_and_hash(annotation_fd)
        finally:
            os.close(annotation_fd)
        try:
            expected_annotation = _text(
                registered.get("annotation_sha256"), "registered.annotation_sha256"
            ).lower()
            if annotation_sha256 != expected_annotation:
                raise ValueError(f"{field}.annotation_path SHA-256 does not match registration")

            if track_consumer is not None:
                if decoded_pcm is None:
                    raise ValueError(
                        "decoder must expose admitted PCM when track_consumer is configured"
                    )
                annotation_snapshot.seek(0)
                annotation_bytes = annotation_snapshot.read()
                annotation_view = memoryview(annotation_bytes)
                if not annotation_view.readonly:
                    raise RuntimeError("annotation handoff must be intrinsically read-only")
                track_consumer(
                    track_id,
                    decoded_pcm,
                    annotation_view,
                    target_sample_rate_hz,
                )
        finally:
            annotation_snapshot.close()

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
    """Run corpus admission and write one path-free verification receipt."""
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
