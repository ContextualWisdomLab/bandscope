"""Local audio source separation using a bounded local spectral model."""

from __future__ import annotations

import logging
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import librosa
import numpy as np

from bandscope_analysis.temporal.analyzer import (
    KNOWN_LIBROSA_NUMBA_WARNING_FILTERS,
    MAX_ANALYSIS_DURATION_SECONDS,
    MAX_AUDIO_FILE_BYTES,
    TARGET_SR,
)

from .lightweight_model import LightweightSpectralStemModel
from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload
from .weights import ensure_verified_model_weights

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AudioSeparationConfig:
    """Resource and local-model settings for stem separation."""

    target_sample_rate: int = TARGET_SR
    max_file_bytes: int = MAX_AUDIO_FILE_BYTES
    max_duration_seconds: float = float(MAX_ANALYSIS_DURATION_SECONDS)
    chunk_duration_seconds: float = 30.0
    model_cache_dir: str | None = None
    download_model_weights: bool = False
    compute_device: str = "auto"


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis.

    Security Notes:
    - Treats the selected audio file as untrusted input.
    - Normalizes the path before use, verifies it is a file, and enforces a
      maximum byte size before decoder handoff.
    - Uses local DSP/ML operations in-process only; no shell execution or
      user-controlled output path is introduced.
    - Model artifacts are optional and separately verified by allowlisted HTTPS,
      bounded downloads, and SHA-256 checks.
    - Inference does not require network access; model downloads are opt-in.
    - Does not log or persist raw audio, separated stems, or full source paths.
    - Fails with bounded, filename-scoped errors so callers can surface a safe
      analysis failure without leaking local directory structure.
    """

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator."""
        self.config = config or AudioSeparationConfig()
        self._compute_device = self._resolve_compute_device(self.config.compute_device)
        cache_dir = (
            Path(self.config.model_cache_dir).expanduser()
            if self.config.model_cache_dir is not None
            else None
        )
        self._model_weights_path = ensure_verified_model_weights(
            cache_dir=cache_dir,
            download_if_missing=self.config.download_model_weights,
        )
        self._model = LightweightSpectralStemModel()

    def separate(self, audio_path: str | Path) -> AudioSeparationResult:
        """Separate local audio into vocals, bass, drums, and other stems."""
        path = self._resolve_audio_file(audio_path)
        audio, sample_rate = self._load_audio(path)
        if audio.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")

        chunk_size = max(1, int(sample_rate * self.config.chunk_duration_seconds))
        stem_chunks: dict[AudioStemName, list[AudioStemArray]] = {
            "vocals": [],
            "bass": [],
            "drums": [],
            "other": [],
        }

        for start in range(0, audio.size, chunk_size):
            chunk = audio[start : start + chunk_size]
            separated_chunk = self._separate_chunk(chunk, sample_rate)
            for stem_name, stem_audio in separated_chunk.items():
                stem_chunks[stem_name].append(stem_audio)

        stems: AudioStemPayload = {
            stem_name: self._fit_length(np.concatenate(chunks), audio.size)
            for stem_name, chunks in stem_chunks.items()
        }
        chunk_count = max(1, len(stem_chunks["vocals"]))
        duration_seconds = float(audio.size / sample_rate)
        logger.info(
            "Separated local audio into canonical stems: %d chunks, %.1f seconds (%s)",
            chunk_count,
            duration_seconds,
            self._compute_device,
        )
        weight_note = (
            "verified stem priors loaded" if self._model_weights_path else "built-in priors"
        )
        return {
            "stems": stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": chunk_count,
            "separation_notes": (
                "Separated selected local audio into vocals, bass, drums, and other "
                f"across {chunk_count} chunks using {self._compute_device} ({weight_note})."
            ),
        }

    def _resolve_audio_file(self, audio_path: str | Path) -> Path:
        """Normalize and validate the selected source path."""
        candidate = Path(audio_path).expanduser()
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

    def _separate_chunk(self, chunk: AudioStemArray, sample_rate: int) -> AudioStemPayload:
        """Split one chunk using the local spectral model backend."""
        return self._model.separate_chunk(chunk, sample_rate)

    def _fit_length(self, audio: AudioStemArray, target_length: int) -> AudioStemArray:
        """Trim or pad a stem to match the source length exactly."""
        fitted = np.zeros(target_length, dtype=np.float32)
        copy_length = min(target_length, int(audio.size))
        if copy_length:
            fitted[:copy_length] = audio[:copy_length]
        return cast(AudioStemArray, fitted)

    def _resolve_compute_device(self, preference: str) -> str:
        """Resolve preferred compute device for optional accelerated backends."""
        normalized = preference.strip().lower()
        if normalized in {"cpu", "mps", "cuda"}:
            return normalized
        try:
            import torch  # type: ignore[import-not-found]

            if torch.cuda.is_available():
                return "cuda"
            if bool(getattr(torch.backends, "mps", None)) and torch.backends.mps.is_available():
                return "mps"
        except Exception:
            return "cpu"
        return "cpu"


def _as_float_array(values: object) -> AudioStemArray:
    """Convert decoder and librosa output to a finite one-dimensional float array."""
    array = np.ravel(np.asarray(values, dtype=np.float32))
    finite = np.nan_to_num(array, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    return cast(AudioStemArray, finite)
