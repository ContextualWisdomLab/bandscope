"""Local audio source separation using an exact verified Demucs model.

Replaces the previous FFT band-masking heuristic — which scored around -39 dB
SI-SDR on a realistic mix (i.e. not real separation) — with Demucs (htdemucs), a
neural source separator that runs locally on CPU. It produces the canonical
vocals/bass/drums/other stems that downstream role, range, and chord analysis
consume.

Security Notes:
- Treats the selected audio file as untrusted input: the path is normalized and
  verified to be a file, and a maximum byte size is enforced before decode.
- Inference runs locally on CPU only after the exact inventoried model has been
  provisioned in the trusted user cache. Loading never falls back to a network
  retrieval path.
- The cache entry must be a non-symlinked regular file with the exact byte size
  and full SHA-256; the verified in-memory bytes are the only bytes passed to
  torch checkpoint deserialization.
- Does not log or persist raw audio, separated stems, or full source paths.
- Fails with bounded, filename-scoped errors so callers can surface a safe
  failure without leaking local directory structure.
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import stat
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import librosa
import numpy as np

from bandscope_analysis.temporal.analyzer import (
    KNOWN_LIBROSA_NUMBA_WARNING_FILTERS,
    MAX_ANALYSIS_DURATION_SECONDS,
    MAX_AUDIO_FILE_BYTES,
    TARGET_SR,
)

from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)

# Demucs htdemucs emits these four sources; this is the canonical stem set.
_STEM_ORDER: tuple[AudioStemName, ...] = ("vocals", "bass", "drums", "other")
_EMPTY_RANGE_EPS = 1e-9


class ModelArtifactError(ValueError):
    """Report a missing, untrusted, or unloadable approved model artifact."""


@dataclass(frozen=True)
class _ModelArtifactSpec:
    """Exact identity of one approved runtime model checkpoint."""

    signature: str
    filename: str
    sha256: str
    size_bytes: int


_MODEL_ARTIFACTS: dict[str, _ModelArtifactSpec] = {
    "htdemucs": _ModelArtifactSpec(
        signature="955717e8",
        filename="955717e8-8726e21a.th",
        sha256="8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4",
        size_bytes=84_141_911,
    )
}
_MODEL_PATH_ENV = "BANDSCOPE_HTDEMUCS_MODEL_PATH"


def _contains_parent_path_segment(path: Path) -> bool:
    """Return True when a raw path contains a parent traversal segment."""
    path_text = str(path)
    normalized_path_text = path_text
    for separator in {os.sep, os.altsep, "\\"}:
        if separator and separator != "/":
            normalized_path_text = normalized_path_text.replace(separator, "/")
    return any(part == ".." for part in normalized_path_text.split("/"))


@dataclass(frozen=True)
class AudioSeparationConfig:
    """Resource and model settings for local stem separation."""

    target_sample_rate: int = TARGET_SR
    max_file_bytes: int = MAX_AUDIO_FILE_BYTES
    max_duration_seconds: float = float(MAX_ANALYSIS_DURATION_SECONDS)
    model_name: str = "htdemucs"
    model_cache_directory: Path | None = None
    device: str = "cpu"
    # Disable Demucs' random time-shift augmentation so repeated analysis of
    # the same bytes is deterministic and benchmark evidence is reproducible.
    shifts: int = 0
    # Demucs splits long audio into overlapping segments internally, bounding
    # memory so long tracks do not OOM the host on CPU.
    overlap: float = 0.25


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis."""

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator (model is loaded lazily)."""
        self.config = config or AudioSeparationConfig()
        self._model: Any = None

    def separate(self, audio_path: str | Path) -> AudioSeparationResult:
        """Separate local audio into vocals, bass, drums, and other stems."""
        path = self._resolve_audio_file(audio_path)
        audio, sample_rate = self._load_audio(path)
        if audio.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")

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
        signal to the stereo tensor Demucs expects, applies the model on CPU, and
        downmixes each source back to a mono float array.
        """
        model = self._load_model()
        sources = self._apply_model(model, audio)
        return {name: _as_float_array(sources[name]) for name in _STEM_ORDER}

    def _load_model(self) -> Any:
        """Lazily load and cache the exact inventoried Demucs model.

        Demucs (and torch) are installed only on platforms with current torch
        wheels (see pyproject platform markers); elsewhere separation fails with a
        clear error the pipeline already surfaces safely.

        Loading is deliberately offline and fail-closed. The checkpoint must
        already exist in the configured cache, and its exact size and full
        SHA-256 are verified before the same in-memory bytes are deserialized.
        """
        if self._model is not None:
            return self._model

        artifact = _MODEL_ARTIFACTS.get(self.config.model_name)
        if artifact is None:
            raise ModelArtifactError("Stem separation model is not inventoried")

        try:
            import torch
            from demucs.states import (  # type: ignore[import-not-found, unused-ignore]
                load_model,
            )
        except ImportError as error:
            raise ValueError(
                "Stem separation is not available on this platform (demucs/torch not installed)"
            ) from error

        configured_path = os.environ.get(_MODEL_PATH_ENV)
        if self.config.model_cache_directory is not None:
            artifact_path = Path(self.config.model_cache_directory) / artifact.filename
        elif configured_path:
            artifact_path = Path(configured_path)
            if (artifact_path.is_absolute(), artifact_path.name) != (True, artifact.filename):
                raise ModelArtifactError(
                    "Stem separation model path must use the absolute inventoried filename"
                )
        else:
            try:
                artifact_path = Path(torch.hub.get_dir()) / "checkpoints" / artifact.filename
            except Exception:
                raise ModelArtifactError(
                    "Stem separation model cache location is unavailable"
                ) from None

        payload = _read_verified_model_artifact(artifact_path, artifact)
        try:
            # This exact in-memory payload passed full SHA-256 and size verification above.
            package = torch.load(  # nosec B614
                io.BytesIO(payload),
                map_location="cpu",
                weights_only=False,
            )
            model = load_model(package)  # type: ignore[no-untyped-call]
            model.eval()
        except Exception:
            raise ModelArtifactError(
                "Stem separation model failed to load after integrity verification"
            ) from None
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
                shifts=self.config.shifts,
                split=True,
                overlap=self.config.overlap,
                progress=False,
            )[0]
        out = out * ref_std + ref_mean
        return {name: out[i].mean(0).numpy() for i, name in enumerate(model.sources)}

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
        """Load bounded mono audio without logging or exposing the full source path."""
        try:
            with path.open("rb") as fileobj:
                file_size = os.fstat(fileobj.fileno()).st_size
                if file_size > self.config.max_file_bytes:
                    raise ValueError(
                        "Audio file is too large for stem separation: "
                        f"{file_size} bytes (max {self.config.max_file_bytes} bytes)"
                    )

                with warnings.catch_warnings():
                    warnings.filterwarnings(
                        "ignore", category=DeprecationWarning, module=r"^audioread"
                    )
                    warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")
                    for category, message, module in KNOWN_LIBROSA_NUMBA_WARNING_FILTERS:
                        warnings.filterwarnings(
                            "ignore",
                            category=category,
                            message=message,
                            module=module,
                        )
                    y, sr = librosa.load(
                        fileobj,
                        sr=self.config.target_sample_rate,
                        mono=True,
                        duration=self.config.max_duration_seconds,
                    )
        except ValueError:
            raise
        except Exception as error:
            raise ValueError(f"Stem separation decode failed for {path.name}") from error

        return _as_float_array(y), int(sr)

    def _fit_length(self, audio: AudioStemArray, target_length: int) -> AudioStemArray:
        """Trim or pad a stem to match the source length exactly."""
        fitted = np.zeros(target_length, dtype=np.float32)
        copy_length = min(target_length, int(audio.size))
        if copy_length:
            fitted[:copy_length] = audio[:copy_length]
        return cast(AudioStemArray, fitted)


def _as_float_array(values: object) -> AudioStemArray:
    """Convert decoder and model output to a finite one-dimensional float array."""
    array = np.ravel(np.asarray(values, dtype=np.float32))
    finite = np.nan_to_num(array, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    return cast(AudioStemArray, finite)


def _read_verified_model_artifact(path: Path, artifact: _ModelArtifactSpec) -> bytes:
    """Read one exact regular cache file and verify its full artifact identity."""
    descriptor: int | None = None
    try:
        cache_metadata = path.lstat()
        if stat.S_ISLNK(cache_metadata.st_mode):
            raise ModelArtifactError("Stem separation model cache entry is a symlink")
        if not stat.S_ISREG(cache_metadata.st_mode):
            raise ModelArtifactError("Stem separation model cache entry is not a regular file")

        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        opened_metadata = os.fstat(descriptor)
        if not stat.S_ISREG(opened_metadata.st_mode):
            raise ModelArtifactError("Stem separation model cache entry is not a regular file")
        if opened_metadata.st_size != artifact.size_bytes:
            raise ModelArtifactError("Stem separation model does not match inventoried byte size")
        with os.fdopen(descriptor, "rb", closefd=False) as fileobj:
            payload = fileobj.read(artifact.size_bytes + 1)
    except FileNotFoundError:
        raise ModelArtifactError("Stem separation model is not provisioned") from None
    except ModelArtifactError:
        raise
    except OSError:
        raise ModelArtifactError("Stem separation model could not be opened securely") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)

    if hashlib.sha256(payload).hexdigest() != artifact.sha256:
        raise ModelArtifactError("Stem separation model does not match inventoried SHA-256")
    return payload
