"""Local audio source separation using a local Demucs model.

Replaces the previous FFT band-masking heuristic — which scored around -39 dB
SI-SDR on a realistic mix (i.e. not real separation) — with Demucs (htdemucs), a
neural source separator that runs locally on CPU. It produces the canonical
vocals/bass/drums/other stems that downstream role, range, and chord analysis
consume.

Security Notes:
- Treats the selected audio file as untrusted input: the path is normalized and
  verified to be a file, and a maximum byte size is enforced before decode.
- Native-admitted sources carry exact byte-count + SHA-256 evidence in the
  per-analysis child-process environment. Partial or malformed evidence fails
  closed. Those bytes are copied once from the opened descriptor into a private
  spooled file, verified against the evidence, and decoded from that same
  snapshot. A later pathname replacement therefore cannot change the bytes
  entering MIR/model work.
- Decoded audio is revalidated against the same versioned resource policy before
  Demucs/model work so overlong, malformed, or non-finite decoder output fails
  closed instead of being silently truncated or normalized.
- Empty, non-finite, or float32-overflowed model stems fail closed before they
  can become successful silence or downstream rehearsal evidence.
- Inference does not intentionally acquire model weights from the network. The
  canonical htdemucs checkpoint must already exist as a bounded regular file in
  the local torch checkpoint cache and reproduce the checksum prefix encoded in
  its canonical filename. BandScope copies the verified descriptor bytes into a
  private temporary local Demucs repository and resolves the checkpoint by its
  signature there, so upstream deserialization cannot reopen or download from
  the mutable cache pathname. Release bundling, full digest/signature provenance,
  and model-rights evidence remain Distribution work.
- PyTorch/Demucs checkpoint incompatibility fails with the same bounded local-model
  diagnostic rather than exposing serialized class names or internal loader details.
- Does not log or persist raw audio, separated stems, or full source paths.
- Fails with bounded, filename-scoped errors so callers can surface a safe
  failure without leaking local directory structure.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import pickle
import stat
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import numpy as np

from bandscope_analysis.audio_decode import decode_mono_audio
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_MAX_DURATION_SECONDS,
    AudioResourcePolicy,
)
from bandscope_analysis.temporal.analyzer import MAX_AUDIO_FILE_BYTES, TARGET_SR

from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)

# Demucs htdemucs emits these four sources; this is the canonical stem set.
_STEM_ORDER: tuple[AudioStemName, ...] = ("vocals", "bass", "drums", "other")
_EMPTY_RANGE_EPS = 1e-9
_MODEL_OUTPUT_ERROR = "Stem separation produced invalid audio."
_ADMITTED_SOURCE_CHANGED_ERROR = "Stem separation source changed before decode."
_LOCAL_MODEL_UNAVAILABLE_ERROR = "Stem separation model weights are not installed locally."
_ADMITTED_AUDIO_BYTES_ENV = "BANDSCOPE_ADMITTED_AUDIO_BYTES"
_ADMITTED_AUDIO_SHA256_ENV = "BANDSCOPE_ADMITTED_AUDIO_SHA256"
_SNAPSHOT_MEMORY_BYTES = 8 * 1024 * 1024
_COPY_CHUNK_BYTES = 64 * 1024
_MAX_LOCAL_DEMUCS_CHECKPOINT_BYTES = 128 * 1024 * 1024
_DEMUCS_LOCAL_CHECKPOINTS = {
    "htdemucs": "955717e8-8726e21a.th",
}


def _contains_parent_path_segment(path: Path) -> bool:
    """Return True when a raw path contains a parent traversal segment."""
    path_text = str(path)
    normalized_path_text = path_text
    for separator in {os.sep, os.altsep, "\\"}:
        if separator and separator != "/":
            normalized_path_text = normalized_path_text.replace(separator, "/")
    return any(part == ".." for part in normalized_path_text.split("/"))


def _valid_sha256_hex(value: object) -> bool:
    """Return whether value is one canonical lowercase SHA-256 hex digest."""
    return (
        isinstance(value, str)
        and len(value) == 64
        and value == value.lower()
        and all(character in "0123456789abcdef" for character in value)
    )


def _checkpoint_signature_and_checksum(checkpoint_name: str) -> tuple[str, str] | None:
    """Return the canonical Demucs signature/checksum encoded in a checkpoint name."""
    stem = Path(checkpoint_name).stem
    if "-" not in stem:
        return None
    signature, checksum_prefix = stem.rsplit("-", 1)
    for value in (signature, checksum_prefix):
        if (
            len(value) != 8
            or value != value.lower()
            or any(character not in "0123456789abcdef" for character in value)
        ):
            return None
    return signature, checksum_prefix


def _admitted_audio_evidence_from_environment() -> tuple[int, str] | None:
    """Read the native-owned evidence scoped to one analysis process.

    The desktop process sets both variables on the child ``Command`` rather than
    mutating its own environment, so concurrent analysis jobs cannot overwrite
    one another's evidence. Missing evidence preserves compatibility for direct
    library callers; a partial pair is treated as a broken trust handoff.
    """
    raw_size = os.environ.get(_ADMITTED_AUDIO_BYTES_ENV)
    digest = os.environ.get(_ADMITTED_AUDIO_SHA256_ENV)
    if raw_size is None and digest is None:
        return None
    if raw_size is None or digest is None:
        raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
    try:
        expected_size = int(raw_size, 10)
    except ValueError as error:
        raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR) from error
    if str(expected_size) != raw_size or expected_size <= 0 or not _valid_sha256_hex(digest):
        raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
    return expected_size, digest


def _snapshot_local_demucs_checkpoint(model_name: str, snapshot_root: Path) -> str | None:
    """Copy one verified cache descriptor into a private local Demucs repository.

    The mutable torch cache pathname is used only to acquire the source descriptor.
    The descriptor must represent the same regular file observed by ``lstat``;
    ``O_NOFOLLOW`` is requested where the host exposes it. The admitted object is
    size-bounded before the copy, and the snapshot must reproduce exactly the
    descriptor size observed at admission. Short reads or later growth fail
    closed before resolver/deserialization. The copied bytes must also reproduce
    the checksum prefix encoded in the canonical checkpoint filename. Demucs
    later deserializes only the private snapshot.
    """
    checkpoint_name = _DEMUCS_LOCAL_CHECKPOINTS.get(model_name)
    identity = (
        _checkpoint_signature_and_checksum(checkpoint_name) if checkpoint_name is not None else None
    )
    if checkpoint_name is None or identity is None:
        return None
    signature, checksum_prefix = identity

    snapshot_path = snapshot_root / checkpoint_name
    try:
        import torch

        checkpoint_path = Path(torch.hub.get_dir()) / "checkpoints" / checkpoint_name
        path_stat = os.lstat(checkpoint_path)
        if not stat.S_ISREG(path_stat.st_mode):
            return None

        open_flags = os.O_RDONLY
        open_flags |= getattr(os, "O_CLOEXEC", 0)
        open_flags |= getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(checkpoint_path, open_flags)
        try:
            descriptor_stat = os.fstat(descriptor)
            if (
                not stat.S_ISREG(descriptor_stat.st_mode)
                or descriptor_stat.st_dev != path_stat.st_dev
                or descriptor_stat.st_ino != path_stat.st_ino
                or descriptor_stat.st_size <= 0
                or descriptor_stat.st_size > _MAX_LOCAL_DEMUCS_CHECKPOINT_BYTES
            ):
                return None

            digest = hashlib.sha256()
            with os.fdopen(descriptor, "rb", closefd=False) as checkpoint_file:
                with snapshot_path.open("xb") as snapshot_file:
                    remaining = descriptor_stat.st_size
                    while remaining:
                        chunk = checkpoint_file.read(min(_COPY_CHUNK_BYTES, remaining))
                        if not chunk:
                            raise ValueError("local Demucs checkpoint changed during snapshot")
                        digest.update(chunk)
                        snapshot_file.write(chunk)
                        remaining -= len(chunk)
                    if checkpoint_file.read(1):
                        raise ValueError("local Demucs checkpoint changed during snapshot")
                    snapshot_file.flush()
                    os.fsync(snapshot_file.fileno())
        finally:
            os.close(descriptor)

        if not digest.hexdigest().startswith(checksum_prefix):
            snapshot_path.unlink(missing_ok=True)
            return None
    except (ImportError, OSError, TypeError, ValueError):
        snapshot_path.unlink(missing_ok=True)
        return None
    return signature


@dataclass(frozen=True)
class AudioSeparationConfig:
    """Resource and model settings for local stem separation."""

    target_sample_rate: int = TARGET_SR
    max_file_bytes: int = MAX_AUDIO_FILE_BYTES
    max_duration_seconds: float = float(DEFAULT_MAX_DURATION_SECONDS)
    model_name: str = "htdemucs"
    device: str = "cpu"
    # Demucs splits long audio into overlapping segments internally, bounding
    # memory so long tracks do not OOM the host on CPU.
    overlap: float = 0.25


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis."""

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator and its canonical resource policy."""
        self.config = config or AudioSeparationConfig()
        self.resource_policy = AudioResourcePolicy(
            max_encoded_file_bytes=self.config.max_file_bytes,
            target_sample_rate=self.config.target_sample_rate,
            max_duration_seconds=self.config.max_duration_seconds,
        )
        self._model: Any = None

    def separate(self, audio_path: str | Path) -> AudioSeparationResult:
        """Separate one local source under the active native-admission contract."""
        evidence = _admitted_audio_evidence_from_environment()
        path = self._resolve_audio_file(audio_path)
        if evidence is None:
            audio, sample_rate = self._load_audio(path)
        else:
            audio, sample_rate = self._load_admitted_audio(
                path,
                expected_file_size_bytes=evidence[0],
                expected_content_sha256=evidence[1],
            )
        return self._separate_loaded_audio(audio, sample_rate)

    def separate_admitted(
        self,
        audio_path: str | Path,
        *,
        expected_file_size_bytes: int,
        expected_content_sha256: str,
    ) -> AudioSeparationResult:
        """Separate bytes that reproduce native Resource Admission evidence.

        The source pathname is resolved and opened once. Before any decoder or
        model call, the opened bytes are copied into a private spooled snapshot
        while exact encoded length and SHA-256 are checked. Decode then consumes
        that snapshot rather than reopening the pathname.
        """
        path = self._resolve_audio_file(audio_path)
        audio, sample_rate = self._load_admitted_audio(
            path,
            expected_file_size_bytes=expected_file_size_bytes,
            expected_content_sha256=expected_content_sha256,
        )
        return self._separate_loaded_audio(audio, sample_rate)

    def _separate_loaded_audio(
        self, audio: AudioStemArray, sample_rate: int
    ) -> AudioSeparationResult:
        """Separate one already-decoded admitted mono signal."""
        if audio.size == 0:
            raise ValueError("Stem separation decode failed for selected audio")

        stem_arrays = self._separate_signal(audio, sample_rate)
        stems: AudioStemPayload = {
            name: self._fit_length(stem_arrays[name], audio.size) for name in _STEM_ORDER
        }
        duration_seconds = float(audio.size / sample_rate)
        logger.info(
            "Separated local audio into %d stems, %.1f seconds",
            len(_STEM_ORDER),
            duration_seconds,
        )
        return {
            "stems": stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": 1,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
            "separation_notes": (
                "Separated selected local audio into vocals, bass, drums, and other "
                f"using the {self.config.model_name} model."
            ),
        }

    def _separate_signal(
        self, audio: AudioStemArray, sample_rate: int
    ) -> dict[AudioStemName, AudioStemArray]:
        """Run the Demucs model on mono audio and return canonical mono stems.

        This is the single boundary to the neural model; it converts the mono
        signal to the stereo tensor Demucs expects, applies the model on the
        configured device, and downmixes each source back to a mono host array.
        """
        model = self._load_model()
        sources = self._apply_model(model, audio)
        return {name: _as_float_array(sources[name]) for name in _STEM_ORDER}

    def _load_model(self) -> Any:
        """Lazily load the canonical Demucs model from one verified local snapshot.

        Demucs (and torch) are installed only on platforms with current torch
        wheels (see pyproject platform markers); elsewhere separation fails with a
        clear error the pipeline already surfaces safely. The canonical cache
        checkpoint is copied from its verified descriptor into a private local
        repository. Passing that repository explicitly keeps Demucs on LocalRepo
        and prevents RemoteRepo/network fallback or a second open of the cache path.
        PyTorch 2.6+ weights-only incompatibility is treated as an unavailable
        admitted model; BandScope does not force unsafe legacy pickle loading here.
        """
        if self._model is None:
            try:
                from demucs.pretrained import (  # type: ignore[import-not-found, unused-ignore]
                    get_model,
                )
            except ImportError as error:
                raise ValueError(
                    "Stem separation is not available on this platform (demucs/torch not installed)"
                ) from error

            with tempfile.TemporaryDirectory(prefix="bandscope-demucs-model-") as snapshot_dir:
                snapshot_root = Path(snapshot_dir)
                model_signature = _snapshot_local_demucs_checkpoint(
                    self.config.model_name,
                    snapshot_root,
                )
                if model_signature is None:
                    raise ValueError(_LOCAL_MODEL_UNAVAILABLE_ERROR)

                try:
                    with contextlib.redirect_stdout(sys.stderr):
                        model = get_model(model_signature, repo=snapshot_root)
                except pickle.UnpicklingError as error:
                    raise ValueError(_LOCAL_MODEL_UNAVAILABLE_ERROR) from error
                model.eval()
                self._model = model
        return self._model

    def _apply_model(self, model: Any, audio: AudioStemArray) -> dict[str, np.ndarray[Any, Any]]:
        """Apply Demucs to a mono signal, returning demucs-source-name -> mono array."""
        import torch
        from demucs.apply import apply_model  # type: ignore[import-not-found, unused-ignore]

        wav = torch.from_numpy(np.stack([audio, audio])).float()
        ref_mean = float(wav.mean())
        ref_std = float(wav.std()) + _EMPTY_RANGE_EPS
        normalized = (wav - ref_mean) / ref_std
        with torch.no_grad():
            out = apply_model(
                model,
                normalized[None],
                device=self.config.device,
                split=True,
                overlap=self.config.overlap,
                progress=False,
            )[0]
        out = out * ref_std + ref_mean
        stems: dict[str, np.ndarray[Any, Any]] = {}
        for index, name in enumerate(model.sources):
            stem = out[index].mean(0)
            if self.config.device != "cpu":
                stem = stem.cpu()
            stems[name] = stem.numpy()
        return stems

    def _resolve_audio_file(self, audio_path: str | Path) -> Path:
        """Normalize and validate the selected source path."""
        candidate = Path(audio_path).expanduser()
        if _contains_parent_path_segment(candidate):
            raise ValueError("Path traversal attempt detected in selected audio path")
        try:
            path = candidate.resolve(strict=True)
        except FileNotFoundError as error:
            raise FileNotFoundError(
                f"Audio file not found: {candidate.name or 'selected audio'}"
            ) from error
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path.name or 'selected audio'}")
        return path

    def _load_audio(self, path: Path) -> tuple[AudioStemArray, int]:
        """Load bounded mono audio through the compatibility decoder authority."""
        try:
            with path.open("rb") as fileobj:
                file_size = os.fstat(fileobj.fileno()).st_size
                if file_size <= 0:
                    raise ValueError(f"Stem separation decode failed for {path.name}")
                try:
                    self.resource_policy.validate_encoded_file_bytes(file_size)
                except ValueError as error:
                    raise ValueError("Audio file is too large for stem separation") from error
                y, sr = decode_mono_audio(fileobj, policy=self.resource_policy)
        except ValueError:
            raise
        except Exception as error:
            raise ValueError(f"Stem separation decode failed for {path.name}") from error

        if y.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")
        return _as_float_array(y), int(sr)

    def _load_admitted_audio(
        self,
        path: Path,
        *,
        expected_file_size_bytes: int,
        expected_content_sha256: str,
    ) -> tuple[AudioStemArray, int]:
        """Snapshot and decode exactly the bytes admitted by native Resource Admission."""
        if (
            not isinstance(expected_file_size_bytes, int)
            or isinstance(expected_file_size_bytes, bool)
            or expected_file_size_bytes <= 0
            or not _valid_sha256_hex(expected_content_sha256)
        ):
            raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
        try:
            self.resource_policy.validate_encoded_file_bytes(expected_file_size_bytes)
        except ValueError as error:
            raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR) from error

        try:
            with path.open("rb") as fileobj:
                actual_size = os.fstat(fileobj.fileno()).st_size
                if actual_size != expected_file_size_bytes:
                    raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
                with tempfile.SpooledTemporaryFile(
                    max_size=_SNAPSHOT_MEMORY_BYTES,
                    mode="w+b",
                ) as snapshot:
                    digest = hashlib.sha256()
                    remaining = expected_file_size_bytes
                    while remaining:
                        chunk = fileobj.read(min(_COPY_CHUNK_BYTES, remaining))
                        if not chunk:
                            raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
                        snapshot.write(chunk)
                        digest.update(chunk)
                        remaining -= len(chunk)
                    if fileobj.read(1) or digest.hexdigest() != expected_content_sha256:
                        raise ValueError(_ADMITTED_SOURCE_CHANGED_ERROR)
                    snapshot.seek(0)
                    y, sr = decode_mono_audio(snapshot, policy=self.resource_policy)
        except ValueError:
            raise
        except Exception as error:
            raise ValueError(f"Stem separation decode failed for {path.name}") from error

        if y.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")
        return _as_float_array(y), int(sr)

    def _fit_length(self, audio: AudioStemArray, target_length: int) -> AudioStemArray:
        """Trim or pad a stem to match the source length exactly."""
        fitted = np.zeros(target_length, dtype=np.float32)
        copy_length = min(target_length, int(audio.size))
        if copy_length:
            fitted[:copy_length] = audio[:copy_length]
        return cast(AudioStemArray, fitted)


def _as_float_array(values: object) -> AudioStemArray:
    """Convert one finite, non-empty decoder/model output into mono float32 audio."""
    try:
        with np.errstate(over="ignore", invalid="ignore"):
            array = np.ravel(np.asarray(values, dtype=np.float32))
    except (OverflowError, TypeError, ValueError) as error:
        raise ValueError(_MODEL_OUTPUT_ERROR) from error
    if array.size == 0 or not np.isfinite(array).all():
        raise ValueError(_MODEL_OUTPUT_ERROR)
    return cast(AudioStemArray, array)
