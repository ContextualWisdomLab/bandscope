"""Deterministic, license-clean PCM fixtures for accuracy acceptance."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import soundfile as sf  # type: ignore[import-untyped]
from numpy.typing import NDArray

C_MAJOR_LABEL = "C"
DEFAULT_SAMPLE_RATE = 22_050
DEFAULT_CLICK_BPM = 120.0
C4_HZ = 261.63
E4_HZ = 329.63
G4_HZ = 392.00
_CLICK_FREQUENCY_HZ = 1_000.0
_CLICK_DURATION_SECONDS = 0.01
_CLICK_DECAY = 80.0


def _fixture_sample_count(duration_seconds: float, sample_rate: int) -> int:
    """Convert fixture timing evidence to at least one finite integer sample."""
    scaled_sample_count = duration_seconds * sample_rate
    if not np.isfinite(scaled_sample_count) or scaled_sample_count < 1:
        raise ValueError("fixture sample count must be finite and at least one sample")
    return int(scaled_sample_count)


def render_c_major_triad(
    duration_seconds: float = 3.0,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> NDArray[np.float32]:
    """Render a unit-peak C major triad as float32 PCM.

    Args:
        duration_seconds: Finite positive non-Boolean fixture length in seconds.
        sample_rate: Finite positive non-Boolean samples-per-second rate.

    Returns:
        Mono float32 samples in ``[-1, 1]``.

    Raises:
        ValueError: If duration or sample rate is Boolean, non-finite, or not positive,
            or if their derived sample count is non-finite or below one sample.
    """
    if (
        isinstance(duration_seconds, bool)
        or not np.isfinite(duration_seconds)
        or duration_seconds <= 0
    ):
        raise ValueError("duration_seconds must be a finite positive non-Boolean number")
    if isinstance(sample_rate, bool) or not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("sample_rate must be a finite positive non-Boolean number")

    sample_count = _fixture_sample_count(duration_seconds, sample_rate)
    times = np.arange(sample_count, dtype=np.float32) / np.float32(sample_rate)
    mix = (
        np.sin(2 * np.pi * np.float32(C4_HZ) * times)
        + np.sin(2 * np.pi * np.float32(E4_HZ) * times)
        + np.sin(2 * np.pi * np.float32(G4_HZ) * times)
    ) / np.float32(3.0)
    return np.asarray(mix, dtype=np.float32)


def render_click_track(
    bpm: float = DEFAULT_CLICK_BPM,
    duration_seconds: float = 8.0,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
) -> NDArray[np.float32]:
    """Render a click track at a known tempo.

    Args:
        bpm: Finite positive non-Boolean true tempo in beats per minute.
        duration_seconds: Finite positive non-Boolean fixture length in seconds.
        sample_rate: Finite positive non-Boolean samples-per-second rate.

    Returns:
        Mono float32 samples with a decaying click on each beat.

    Raises:
        ValueError: If tempo, duration, or sample rate is Boolean, non-finite,
            or not positive, if the derived sample count is non-finite or below
            one sample, if the derived beat interval is non-finite or shorter
            than one sample, or if the click pulse itself is shorter than one
            sample at the requested rate.
    """
    if isinstance(bpm, bool) or not np.isfinite(bpm) or bpm <= 0:
        raise ValueError("bpm must be positive, finite, and non-Boolean")
    if (
        isinstance(duration_seconds, bool)
        or not np.isfinite(duration_seconds)
        or duration_seconds <= 0
    ):
        raise ValueError("duration_seconds must be a finite positive non-Boolean number")
    if isinstance(sample_rate, bool) or not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("sample_rate must be a finite positive non-Boolean number")

    sample_count = _fixture_sample_count(duration_seconds, sample_rate)
    audio = np.zeros(sample_count, dtype=np.float32)
    with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
        interval_seconds = float(np.divide(60.0, bpm))
        interval_samples = float(np.multiply(interval_seconds, sample_rate))
    if not np.isfinite(interval_seconds):
        raise ValueError("bpm must produce a finite beat interval")
    if not np.isfinite(interval_samples) or interval_samples < 1:
        raise ValueError("beat interval must be finite and at least one sample")

    click_sample_count = _CLICK_DURATION_SECONDS * sample_rate
    if not np.isfinite(click_sample_count) or click_sample_count < 1:
        raise ValueError("click length must be finite and at least one sample")
    click_length = int(click_sample_count)
    click_times = np.arange(click_length, dtype=np.float32) / np.float32(sample_rate)
    click = (
        np.sin(2 * np.pi * np.float32(_CLICK_FREQUENCY_HZ) * click_times)
        * np.exp(-click_times * np.float32(_CLICK_DECAY))
    ).astype(np.float32)
    beat_time = 0.0
    while True:
        start = int(beat_time * sample_rate)
        if start >= sample_count:
            break
        end = min(sample_count, start + click_length)
        audio[start:end] += click[: end - start]
        beat_time += interval_seconds

    peak = float(np.max(np.abs(audio)))
    if peak <= 0:
        raise ValueError("click pulse must contain non-zero signal")
    audio /= np.float32(peak)
    return audio


def write_pcm_wav(path: Path, audio: NDArray[np.floating], sample_rate: int) -> str:
    """Write a WAV file and return the SHA-256 digest of the bytes on disk.

    Args:
        path: Destination path. Parent directories are created.
        audio: Mono PCM samples.
        sample_rate: Finite positive non-Boolean samples-per-second rate used to write the file.

    Returns:
        Lowercase hex SHA-256 of the written file.

    Raises:
        ValueError: If the sample rate is Boolean, non-finite, or not positive.
    """
    if isinstance(sample_rate, bool) or not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("sample_rate must be a finite positive non-Boolean number")
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.asarray(audio, dtype=np.float32), sample_rate)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_pcm_wav(path: Path) -> tuple[NDArray[np.float32], int]:
    """Decode a WAV file to mono float32 PCM.

    Args:
        path: Existing WAV path written by ``write_pcm_wav``.

    Returns:
        A tuple of mono samples and the file sample rate.

    Raises:
        ValueError: If the file has no samples after decode.
    """
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim > 1:
        samples = np.mean(samples, axis=1).astype(np.float32)
    if samples.size == 0:
        raise ValueError("decoded WAV has no samples")
    return samples, int(sample_rate)


def read_verified_fixture_bytes(path: Path, expected_sha256: str) -> bytes:
    """Read one immutable fixture snapshot and verify its registered digest.

    Args:
        path: Existing WAV path.
        expected_sha256: Lowercase hex digest recorded in the case manifest.

    Returns:
        The exact bytes whose SHA-256 matched ``expected_sha256``.

    Raises:
        ValueError: If the snapshot digest does not match.
    """
    payload = path.read_bytes()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected_sha256:
        raise ValueError("Accuracy fixture checksum mismatch")
    return payload


def assert_fixture_checksum(path: Path, expected_sha256: str) -> None:
    """Fail closed when a fixture file does not match its registered digest.

    Args:
        path: Existing WAV path.
        expected_sha256: Lowercase hex digest recorded in the case manifest.

    Raises:
        ValueError: If the file digest does not match.
    """
    read_verified_fixture_bytes(path, expected_sha256)
