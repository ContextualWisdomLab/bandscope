"""Local audio source separation with ML model support and DSP fallback."""

from __future__ import annotations

import logging
import os
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

from .demucs_separator import DemucsConfig, DemucsModelSeparator, is_demucs_available
from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AudioSeparationConfig:
    """Resource and band-split settings for local stem separation."""

    target_sample_rate: int = TARGET_SR
    max_file_bytes: int = MAX_AUDIO_FILE_BYTES
    max_duration_seconds: float = float(MAX_ANALYSIS_DURATION_SECONDS)
    chunk_duration_seconds: float = 30.0
    bass_cutoff_hz: float = 250.0
    vocal_low_hz: float = 300.0
    vocal_high_hz: float = 3_400.0
    drum_low_hz: float = 3_400.0
    use_demucs: bool = True
    demucs_config: DemucsConfig | None = None


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis.

    Uses the Demucs ML model for high-quality separation when available,
    falling back to bounded DSP heuristics when torch/demucs is not installed.

    Security Notes:
    - Treats the selected audio file as untrusted input.
    - Normalizes the path before use, verifies it is a file, and enforces a
      maximum byte size before decoder handoff.
    - When using Demucs: model weights loaded from verified local cache only;
      no network access during inference.
    - When using DSP fallback: uses librosa in-process only.
    - Does not log or persist raw audio, separated stems, or full source paths.
    - Fails with bounded, filename-scoped errors so callers can surface a safe
      analysis failure without leaking local directory structure.
    """

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator."""
        self.config = config or AudioSeparationConfig()
        self._demucs: DemucsModelSeparator | None = None
        self._demucs_checked = False

    @property
    def uses_ml_model(self) -> bool:
        """Return True if ML-based separation is active."""
        return self._get_demucs() is not None

    def _get_demucs(self) -> DemucsModelSeparator | None:
        """Lazily check and initialize Demucs if available."""
        if self._demucs_checked:
            return self._demucs

        self._demucs_checked = True
        if not self.config.use_demucs:
            logger.info("Demucs disabled by configuration; using DSP fallback.")
            return None

        if not is_demucs_available():
            logger.info(
                "Demucs/torch not available; using DSP frequency-band fallback."
            )
            return None

        try:
            self._demucs = DemucsModelSeparator(self.config.demucs_config)
            logger.info("Demucs ML model separator initialized.")
        except Exception as e:
            logger.warning("Failed to initialize Demucs: %s; using DSP fallback.", e)
            self._demucs = None

        return self._demucs

    def separate(self, audio_path: str | Path) -> AudioSeparationResult:
        """Separate local audio into vocals, bass, drums, and other stems."""
        path = self._resolve_audio_file(audio_path)
        audio, sample_rate = self._load_audio(path)
        if audio.size == 0:
            raise ValueError(f"Stem separation decode failed for {path.name}")

        demucs = self._get_demucs()
        if demucs is not None:
            return self._separate_with_demucs(demucs, audio, sample_rate)

        return self._separate_with_dsp(audio, sample_rate)

    def _separate_with_demucs(
        self,
        demucs: DemucsModelSeparator,
        audio: AudioStemArray,
        sample_rate: int,
    ) -> AudioSeparationResult:
        """Separate audio using the Demucs ML model with chunked inference."""
        try:
            stems = demucs.separate(audio, sample_rate)
        except Exception as e:
            logger.warning(
                "Demucs separation failed: %s; falling back to DSP.", e
            )
            return self._separate_with_dsp(audio, sample_rate)

        # Ensure all stems match the input length
        target_length = audio.size
        fitted_stems: AudioStemPayload = {}
        for stem_name in ("vocals", "bass", "drums", "other"):
            stem_key = cast(AudioStemName, stem_name)
            if stem_key in stems:
                fitted_stems[stem_key] = self._fit_length(stems[stem_key], target_length)
            else:
                fitted_stems[stem_key] = cast(
                    AudioStemArray, np.zeros(target_length, dtype=np.float32)
                )

        duration_seconds = float(audio.size / sample_rate)
        demucs_cfg = self.config.demucs_config or DemucsConfig()
        chunk_count = max(
            1,
            int(np.ceil(audio.size / (sample_rate * demucs_cfg.chunk_seconds))),
        )
        logger.info(
            "Separated local audio with Demucs ML model: %.1f seconds",
            duration_seconds,
        )
        return {
            "stems": fitted_stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": chunk_count,
            "separation_notes": (
                "Separated audio using Demucs ML model (htdemucs) into "
                "vocals, bass, drums, and other stems."
            ),
        }

    def _separate_with_dsp(
        self, audio: AudioStemArray, sample_rate: int
    ) -> AudioSeparationResult:
        """Separate audio using DSP frequency-band heuristics (fallback)."""
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
            "Separated local audio into canonical stems: %d chunks, %.1f seconds",
            chunk_count,
            duration_seconds,
        )
        return {
            "stems": stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": chunk_count,
            "separation_notes": (
                "Separated selected local audio into vocals, bass, drums, and other "
                f"across {chunk_count} chunks."
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
        """Split one chunk into coarse canonical frequency and percussion bands."""
        spectrum = cast(
            np.ndarray[Any, np.dtype[np.complexfloating[Any, Any]]],
            np.fft.rfft(chunk),
        )
        frequencies = cast(
            np.ndarray[Any, np.dtype[np.floating[Any]]],
            np.fft.rfftfreq(chunk.size, d=1.0 / sample_rate),
        )
        bass_mask = frequencies <= self.config.bass_cutoff_hz
        vocal_mask = (frequencies >= self.config.vocal_low_hz) & (
            frequencies < self.config.vocal_high_hz
        )
        drum_mask = frequencies >= self.config.drum_low_hz
        other_mask = ~(bass_mask | vocal_mask | drum_mask)

        return {
            "vocals": _ifft_band(spectrum, vocal_mask, chunk.size),
            "bass": _ifft_band(spectrum, bass_mask, chunk.size),
            "drums": _ifft_band(spectrum, drum_mask, chunk.size),
            "other": _ifft_band(spectrum, other_mask, chunk.size),
        }

    def _fit_length(self, audio: AudioStemArray, target_length: int) -> AudioStemArray:
        """Trim or pad a stem to match the source length exactly."""
        fitted = np.zeros(target_length, dtype=np.float32)
        copy_length = min(target_length, int(audio.size))
        if copy_length:
            fitted[:copy_length] = audio[:copy_length]
        return cast(AudioStemArray, fitted)


def _ifft_band(
    spectrum: np.ndarray[Any, np.dtype[np.complexfloating[Any, Any]]],
    mask: np.ndarray[Any, np.dtype[np.bool_]],
    target_length: int,
) -> AudioStemArray:
    """Convert a masked FFT spectrum into a finite float32 stem."""
    masked = np.where(mask, spectrum, 0)
    audio = np.fft.irfft(masked, n=target_length)
    return _as_float_array(audio)


def _as_float_array(values: object) -> AudioStemArray:
    """Convert decoder and librosa output to a finite one-dimensional float array."""
    array = np.ravel(np.asarray(values, dtype=np.float32))
    finite = np.nan_to_num(array, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    return cast(AudioStemArray, finite)
