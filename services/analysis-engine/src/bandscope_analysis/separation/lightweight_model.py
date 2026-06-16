"""Lightweight local spectral model used by the stem separator."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import librosa
import numpy as np

from .model import AudioStemArray, AudioStemPayload


@dataclass(frozen=True)
class LightweightSpectralModelConfig:
    """Tunable settings for local spectral separation."""

    n_fft: int = 2_048
    hop_length: int = 512
    nmf_components: int = 3
    nmf_iterations: int = 35
    random_seed: int = 17
    vocal_low_hz: float = 300.0
    vocal_high_hz: float = 3_400.0


class LightweightSpectralStemModel:
    """Chunk-level local stem model using HPSS + bounded NMF."""

    def __init__(
        self,
        *,
        config: LightweightSpectralModelConfig | None = None,
    ) -> None:
        """Initialize a deterministic local spectral separator."""
        self.config = config or LightweightSpectralModelConfig()

    def separate_chunk(self, chunk: AudioStemArray, sample_rate: int) -> AudioStemPayload:
        """Return canonical stem estimates for one audio chunk."""
        if chunk.size == 0:
            return self._empty_payload(0)

        n_fft = max(64, min(self.config.n_fft, _largest_power_of_two(int(chunk.size))))
        hop_length = max(32, min(self.config.hop_length, max(32, n_fft // 4)))

        padded = _pad_to_min_length(chunk, n_fft)
        stft = librosa.stft(
            padded,
            n_fft=n_fft,
            hop_length=hop_length,
            center=False,
        )
        phase = np.exp(1j * np.angle(stft))
        magnitude = np.abs(stft)
        harmonic_mag, percussive_mag = librosa.decompose.hpss(magnitude)
        bass_mag, vocal_mag, other_mag = self._split_harmonic_components(
            harmonic_mag,
            sample_rate,
            n_fft,
        )

        target_length = int(chunk.size)
        return {
            "vocals": _reconstruct(vocal_mag, phase, hop_length, target_length),
            "bass": _reconstruct(bass_mag, phase, hop_length, target_length),
            "drums": _reconstruct(percussive_mag, phase, hop_length, target_length),
            "other": _reconstruct(other_mag, phase, hop_length, target_length),
        }

    def _split_harmonic_components(
        self,
        harmonic_mag: np.ndarray[Any, np.dtype[np.floating[Any]]],
        sample_rate: int,
        n_fft: int,
    ) -> tuple[np.ndarray[Any, np.dtype[np.floating[Any]]], ...]:
        """Assign harmonic NMF components to bass, vocals, and other."""
        if not np.any(harmonic_mag > 0):
            empty = np.zeros_like(harmonic_mag, dtype=np.float32)
            return empty, empty, empty

        components = self._nmf(harmonic_mag)
        if len(components) < 3:
            return self._band_fallback(harmonic_mag, sample_rate, n_fft)

        frequencies = cast(
            np.ndarray[Any, np.dtype[np.floating[Any]]],
            librosa.fft_frequencies(sr=sample_rate, n_fft=n_fft),
        )
        centroids = [
            float(
                np.sum(component.sum(axis=1) * frequencies) / (np.sum(component.sum(axis=1)) + 1e-8)
            )
            for component in components
        ]
        bass_idx = int(np.argmin(np.asarray(centroids, dtype=np.float32)))

        remaining = [index for index in range(len(components)) if index != bass_idx]
        vocal_band = (frequencies >= self.config.vocal_low_hz) & (
            frequencies <= self.config.vocal_high_hz
        )
        vocal_scores = [
            float(np.sum(components[index][vocal_band]) / (np.sum(components[index]) + 1e-8))
            for index in remaining
        ]
        vocal_idx = remaining[int(np.argmax(np.asarray(vocal_scores, dtype=np.float32)))]
        other_idx = [index for index in remaining if index != vocal_idx][0]

        return components[bass_idx], components[vocal_idx], components[other_idx]

    def _band_fallback(
        self,
        harmonic_mag: np.ndarray[Any, np.dtype[np.floating[Any]]],
        sample_rate: int,
        n_fft: int,
    ) -> tuple[np.ndarray[Any, np.dtype[np.floating[Any]]], ...]:
        """Fallback split when NMF decomposition is underdetermined."""
        frequencies = cast(
            np.ndarray[Any, np.dtype[np.floating[Any]]],
            librosa.fft_frequencies(sr=sample_rate, n_fft=n_fft),
        )
        bass_mask = frequencies <= 250.0
        vocal_mask = (frequencies >= self.config.vocal_low_hz) & (
            frequencies <= self.config.vocal_high_hz
        )
        other_mask = ~(bass_mask | vocal_mask)
        return (
            harmonic_mag * bass_mask[:, None],
            harmonic_mag * vocal_mask[:, None],
            harmonic_mag * other_mask[:, None],
        )

    def _nmf(
        self, magnitude: np.ndarray[Any, np.dtype[np.floating[Any]]]
    ) -> list[np.ndarray[Any, np.dtype[np.floating[Any]]]]:
        """Run bounded multiplicative-update NMF on a non-negative spectrogram."""
        v = np.maximum(magnitude.astype(np.float32, copy=False), 0.0) + 1e-8
        freq_bins, time_frames = v.shape
        rank = max(1, min(self.config.nmf_components, freq_bins, time_frames))
        rng = np.random.default_rng(self.config.random_seed)
        w = rng.random((freq_bins, rank), dtype=np.float32) + 1e-8
        h = rng.random((rank, time_frames), dtype=np.float32) + 1e-8

        for _ in range(self.config.nmf_iterations):
            wh = np.maximum(w @ h, 1e-8)
            ratio = v / wh

            h_denom = np.maximum(w.sum(axis=0, keepdims=True).T, 1e-8)
            h *= (w.T @ ratio) / h_denom

            wh = np.maximum(w @ h, 1e-8)
            ratio = v / wh
            w_denom = np.maximum(h.sum(axis=1, keepdims=True).T, 1e-8)
            w *= (ratio @ h.T) / w_denom

        scale = np.maximum(w.sum(axis=0, keepdims=True), 1e-8)
        w /= scale
        h *= scale.T

        return [np.outer(w[:, index], h[index, :]).astype(np.float32) for index in range(rank)]

    def _empty_payload(self, length: int) -> AudioStemPayload:
        """Return zero-valued stem arrays for invalid input chunks."""
        empty = np.zeros(length, dtype=np.float32)
        return {
            "vocals": cast(AudioStemArray, empty.copy()),
            "bass": cast(AudioStemArray, empty.copy()),
            "drums": cast(AudioStemArray, empty.copy()),
            "other": cast(AudioStemArray, empty.copy()),
        }


def _reconstruct(
    magnitude: np.ndarray[Any, np.dtype[np.floating[Any]]],
    phase: np.ndarray[Any, np.dtype[np.complexfloating[Any, Any]]],
    hop_length: int,
    target_length: int,
) -> AudioStemArray:
    """Reconstruct time-domain audio from magnitude and original phase."""
    complex_spec = magnitude * phase
    audio = librosa.istft(
        complex_spec,
        hop_length=hop_length,
        center=False,
        length=target_length,
    )
    finite = np.nan_to_num(np.asarray(audio, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    return cast(AudioStemArray, np.ravel(finite))


def _pad_to_min_length(chunk: AudioStemArray, minimum_length: int) -> AudioStemArray:
    """Pad short chunks to satisfy STFT frame requirements."""
    if chunk.size >= minimum_length:
        return chunk
    padded = np.zeros(minimum_length, dtype=np.float32)
    padded[: int(chunk.size)] = chunk
    return cast(AudioStemArray, padded)


def _largest_power_of_two(value: int) -> int:
    """Return the largest power of two not greater than ``value``."""
    if value < 1:
        return 0
    return 1 << (value.bit_length() - 1)
