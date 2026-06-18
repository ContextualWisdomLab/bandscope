"""Local audio source separation using bounded DSP heuristics."""

from __future__ import annotations

import hashlib
import json
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

from .model import AudioSeparationResult, AudioStemArray, AudioStemName, AudioStemPayload

logger = logging.getLogger(__name__)
_BANDSPLIT_PROFILE_PATH = Path(__file__).with_name("model_weights") / "bandsplit-v1.json"
_BANDSPLIT_PROFILE_SHA256 = "ced4ae5c9077aace1694b6fafee1877e46e836e293545dcb6ea06cb579984254"


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
    model_profile_path: str | None = None
    model_profile_sha256: str | None = None


class AudioStemSeparator:
    """Split a selected local mix into canonical stems for downstream analysis.

    Security Notes:
    - Treats the selected audio file as untrusted input.
    - Normalizes the path before use, verifies it is a file, and enforces a
      maximum byte size before decoder handoff.
    - Uses librosa in-process and loads only the bundled profile or a local
      checksum-pinned profile override.
    - No shell execution or user-controlled output path is introduced.
    - Does not log or persist raw audio, separated stems, or full source paths.
    - Fails with bounded, filename-scoped errors so callers can surface a safe
      analysis failure without leaking local directory structure.
    """

    def __init__(self, config: AudioSeparationConfig | None = None) -> None:
        """Initialize the local stem separator."""
        self.config = config or AudioSeparationConfig()
        profile = self._load_model_profile()
        self._bass_cutoff_hz = profile["bassCutoffHz"]
        self._vocal_low_hz = profile["vocalLowHz"]
        self._vocal_high_hz = profile["vocalHighHz"]
        self._drum_low_hz = profile["drumLowHz"]

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
            "Separated local audio into canonical stems: %d chunks, %.1f seconds",
            chunk_count,
            duration_seconds,
        )
        return {
            "stems": stems,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
            "chunk_count": chunk_count,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
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
        bass_mask = frequencies <= self._bass_cutoff_hz
        vocal_mask = (frequencies >= self._vocal_low_hz) & (frequencies < self._vocal_high_hz)
        drum_mask = frequencies >= self._drum_low_hz
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

    def _load_model_profile(self) -> dict[str, float]:
        """Load and verify a bounded local profile for lightweight stem separation."""
        profile_path = _BANDSPLIT_PROFILE_PATH
        expected_sha256 = _BANDSPLIT_PROFILE_SHA256

        if self.config.model_profile_path:
            profile_candidate = Path(self.config.model_profile_path).expanduser()
            try:
                profile_path = profile_candidate.resolve(strict=True)
            except FileNotFoundError as error:
                raise FileNotFoundError(
                    f"Model profile not found: {profile_candidate.name or 'selected profile'}"
                ) from error
            if not self.config.model_profile_sha256:
                raise ValueError("model_profile_sha256 is required when model_profile_path is set")
            expected_sha256 = self.config.model_profile_sha256

        profile_bytes = profile_path.read_bytes()
        observed_sha256 = hashlib.sha256(profile_bytes).hexdigest()
        if observed_sha256 != expected_sha256:
            raise ValueError("Model profile verification failed: SHA256 mismatch")

        try:
            profile = json.loads(profile_bytes.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Model profile verification failed: invalid JSON profile") from error
        if not isinstance(profile, dict):
            raise ValueError("Model profile verification failed: invalid JSON profile")

        loaded_profile = {
            "bassCutoffHz": float(profile.get("bassCutoffHz", self.config.bass_cutoff_hz)),
            "vocalLowHz": float(profile.get("vocalLowHz", self.config.vocal_low_hz)),
            "vocalHighHz": float(profile.get("vocalHighHz", self.config.vocal_high_hz)),
            "drumLowHz": float(profile.get("drumLowHz", self.config.drum_low_hz)),
        }
        _validate_profile(loaded_profile)
        return loaded_profile


def _validate_profile(profile: dict[str, float]) -> None:
    """Validate band profile values before using them for FFT masks."""
    values = tuple(profile.values())
    if not all(np.isfinite(value) for value in values):
        raise ValueError("Model profile verification failed: non-finite band value")
    if not (
        0.0
        < profile["bassCutoffHz"]
        < profile["vocalLowHz"]
        < profile["vocalHighHz"]
        <= profile["drumLowHz"]
    ):
        raise ValueError("Model profile verification failed: invalid band ordering")


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
