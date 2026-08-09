"""Utilities for the opt-in real-YouTube known-stem benchmark.

The helpers live under ``tests`` deliberately: they fetch only the fixed public
benchmark assets below and are not part of BandScope's production download API.
"""

from __future__ import annotations

import hashlib
import math
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import numpy as np

_DOWNLOAD_CHUNK_BYTES = 64 * 1024
_ENERGY_EPSILON = 1e-12
_MAX_REFERENCE_BYTES = 64 * 1024 * 1024
_CANONICAL_STEMS = {"vocals", "bass", "drums", "other"}

# Provisional sentinel thresholds derived from the pinned creator master on the
# documented Linux CPU baseline. They remain advisory until an authorized
# YouTube candidate is measured and ADR-0002 is accepted.
MIN_MASTER_IDENTITY_CORRELATION = 0.90
MIN_VOCAL_SI_SDR_IMPROVEMENT_DB = 0.5
MIN_VOCAL_ASSIGNMENT_MARGIN_DB = 3.0
MAX_MASTER_DURATION_DRIFT_SECONDS = 1.0


class _AllowlistedRedirectHandler(HTTPRedirectHandler):
    """Allow reference redirects only when HTTPS and the exact host are preserved."""

    def __init__(self, expected_host: str) -> None:
        """Store the only host that a redirect may target."""
        super().__init__()
        self._expected_host = expected_host

    def redirect_request(
        self,
        request: Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> Request | None:
        """Validate a redirect target before urllib creates or sends its request."""
        _validate_fixture_url(new_url, self._expected_host)
        return super().redirect_request(
            request,
            file_pointer,
            code,
            message,
            headers,
            new_url,
        )


@dataclass(frozen=True)
class KnownStemFixture:
    """Describe one immutable reference archive and its matching YouTube mix."""

    youtube_url: str
    video_id: str
    reference_archive_url: str
    reference_archive_host: str
    reference_archive_sha256: str
    reference_archive_bytes: int
    reference_member: str
    reference_member_sha256: str
    reference_member_bytes: int
    creator_master_url: str
    creator_master_host: str
    creator_master_sha256: str
    creator_master_bytes: int
    creator_master_duration_seconds: float
    target_stem: str


@dataclass(frozen=True)
class AlignedStemWindow:
    """Hold one globally aligned active reference and mixture window."""

    mixture: np.ndarray
    reference: np.ndarray
    lag_samples: int
    reference_start: int
    correlation: float


@dataclass(frozen=True)
class KnownStemBenchmarkWindow:
    """Hold identity evidence plus one globally composed vocal scoring window."""

    mixture: np.ndarray
    reference: np.ndarray
    youtube_to_master_lag_samples: int
    master_to_reference_lag_samples: int
    reference_start: int
    identity_correlation: float


BRAD_SUCKS_FIXTURE = KnownStemFixture(
    youtube_url="https://www.youtube.com/watch?v=e4pIpWVbMKs",
    video_id="e4pIpWVbMKs",
    reference_archive_url=("https://bradmedia.com/media/source/making_me_nervous-120bpm.zip"),
    reference_archive_host="bradmedia.com",
    reference_archive_sha256=("473578daa0bcf022448a144c5df9111ddf11e5a90e77f3649254e7813ba4981d"),
    reference_archive_bytes=31_055_394,
    reference_member="vocals.wav",
    reference_member_sha256=("4c7bb41c3f8bda1471dfd214b84f1d3457af344feeba33f0b31982ed0d808afc"),
    reference_member_bytes=25_603_092,
    creator_master_url=(
        "https://static1.squarespace.com/static/5bf9a31c96d4550b42f456f2/"
        "5c002e7503ce649ee6716b51/5c00331d6d2a731d3dfa9896/1543517055733/"
        "01%2BBrad%2BSucks%2B-%2BMaking%2BMe%2BNervous.mp3"
    ),
    creator_master_host="static1.squarespace.com",
    creator_master_sha256=("fc7f7c2a0387e46885e5c133cbd6d14d7de4d48908b68f1135354df0a336cf1d"),
    creator_master_bytes=4_941_627,
    creator_master_duration_seconds=155.945238,
    target_stem="vocals",
)


def _as_finite_signal(values: np.ndarray, name: str) -> np.ndarray:
    """Return a finite one-dimensional float64 signal."""
    signal = np.ravel(np.asarray(values, dtype=np.float64))
    if signal.size < 2:
        raise ValueError(f"{name} signal must contain at least two samples")
    if not np.isfinite(signal).all():
        raise ValueError(f"{name} signal must contain only finite samples")
    return signal


def zero_mean_si_sdr(estimate: np.ndarray, reference: np.ndarray) -> float:
    """Return zero-mean scale-invariant signal-to-distortion ratio in decibels."""
    estimated_signal = _as_finite_signal(estimate, "estimate")
    reference_signal = _as_finite_signal(reference, "reference")
    if estimated_signal.shape != reference_signal.shape:
        raise ValueError("estimate and reference signals must have equal lengths")

    estimated_signal = estimated_signal - float(np.mean(estimated_signal))
    reference_signal = reference_signal - float(np.mean(reference_signal))
    reference_energy = float(np.dot(reference_signal, reference_signal))
    estimate_energy = float(np.dot(estimated_signal, estimated_signal))
    if reference_energy <= _ENERGY_EPSILON:
        raise ValueError("reference signal has insufficient audio energy")
    if estimate_energy <= _ENERGY_EPSILON:
        raise ValueError("estimate signal has insufficient audio energy")

    scale = float(np.dot(estimated_signal, reference_signal) / reference_energy)
    projection = scale * reference_signal
    projection_energy = float(np.dot(projection, projection))
    residual = estimated_signal - projection
    residual_energy = float(np.dot(residual, residual))
    if projection_energy <= _ENERGY_EPSILON:
        return float("-inf")
    if residual_energy <= _ENERGY_EPSILON:
        return float("inf")
    return float(10.0 * math.log10(projection_energy / residual_energy))


def si_sdr_improvement(estimate: np.ndarray, mixture: np.ndarray, reference: np.ndarray) -> float:
    """Return SI-SDR improvement over using the downloaded mixture as the estimate."""
    separation_score = zero_mean_si_sdr(estimate, reference)
    mixture_score = zero_mean_si_sdr(mixture, reference)
    improvement = separation_score - mixture_score
    if math.isnan(improvement):
        raise ValueError("SI-SDR improvement is undefined for these signals")
    return float(improvement)


def _fft_cross_correlation(observation: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Match ``numpy.correlate(observation, reference, 'full')`` using an FFT."""
    result_size = observation.size + reference.size - 1
    fft_size = 1 << (result_size - 1).bit_length()
    spectrum = np.fft.rfft(observation, fft_size) * np.fft.rfft(reference[::-1], fft_size)
    return np.fft.irfft(spectrum, fft_size)[:result_size]


def _rms_envelope(signal: np.ndarray, hop_samples: int) -> np.ndarray:
    """Return a log-RMS envelope with one value per non-overlapping hop."""
    frame_count = math.ceil(signal.size / hop_samples)
    padded = np.zeros(frame_count * hop_samples, dtype=np.float64)
    padded[: signal.size] = signal
    frames = padded.reshape(frame_count, hop_samples)
    rms = np.sqrt(np.mean(np.square(frames), axis=1))
    envelope = np.log1p(10.0 * rms)
    return envelope - float(np.mean(envelope))


def _strongest_window_start(signal: np.ndarray, window_samples: int) -> int:
    """Return the sample index of the maximum-energy fixed-width window."""
    energy = np.square(signal)
    cumulative = np.concatenate((np.zeros(1, dtype=np.float64), np.cumsum(energy)))
    window_energy = cumulative[window_samples:] - cumulative[:-window_samples]
    return int(np.argmax(window_energy))


def _normalized_correlation(left: np.ndarray, right: np.ndarray) -> float:
    """Return signed zero-mean Pearson correlation for two equal windows."""
    left_centered = left - float(np.mean(left))
    right_centered = right - float(np.mean(right))
    denominator = math.sqrt(
        float(np.dot(left_centered, left_centered)) * float(np.dot(right_centered, right_centered))
    )
    if denominator <= _ENERGY_EPSILON:
        raise ValueError("aligned benchmark window has insufficient audio energy")
    return float(np.dot(left_centered, right_centered) / denominator)


def align_active_reference_window(
    mixture: np.ndarray,
    reference: np.ndarray,
    *,
    sample_rate: int,
    window_seconds: float,
    max_lag_seconds: float,
    envelope_hop_seconds: float = 0.01,
    refinement_seconds: float = 0.25,
) -> AlignedStemWindow:
    """Align once globally, then return the strongest known-stem scoring window.

    The global lag is estimated from low-rate RMS envelopes. A bounded waveform
    refinement is then performed around that lag for the chosen active window.
    The resulting single offset is applied to both the mixture and reference;
    stems are never aligned independently.
    """
    mixture_signal = _as_finite_signal(mixture, "mixture")
    reference_signal = _as_finite_signal(reference, "reference")
    if sample_rate <= 0:
        raise ValueError("sample_rate must be positive")
    if window_seconds <= 0.0 or max_lag_seconds < 0.0:
        raise ValueError("alignment durations are invalid")
    if envelope_hop_seconds <= 0.0 or refinement_seconds < 0.0:
        raise ValueError("alignment resolution is invalid")

    window_samples = int(round(window_seconds * sample_rate))
    if window_samples < 2 or window_samples > reference_signal.size:
        raise ValueError("reference is shorter than the requested scoring window")
    hop_samples = max(1, int(round(envelope_hop_seconds * sample_rate)))
    mixture_envelope = _rms_envelope(mixture_signal, hop_samples)
    reference_envelope = _rms_envelope(reference_signal, hop_samples)
    coarse_correlation = _fft_cross_correlation(mixture_envelope, reference_envelope)
    coarse_lags = np.arange(
        -reference_envelope.size + 1,
        mixture_envelope.size,
        dtype=np.int64,
    )
    max_lag_frames = int(math.ceil(max_lag_seconds * sample_rate / hop_samples))
    valid_coarse = np.flatnonzero(np.abs(coarse_lags) <= max_lag_frames)
    if valid_coarse.size == 0:
        raise ValueError("reference fixture has no permitted alignment lag")
    best_coarse_index = int(valid_coarse[np.argmax(coarse_correlation[valid_coarse])])
    coarse_lag_samples = int(coarse_lags[best_coarse_index]) * hop_samples

    reference_start = _strongest_window_start(reference_signal, window_samples)
    reference_window = reference_signal[reference_start : reference_start + window_samples]
    expected_mixture_start = reference_start + coarse_lag_samples
    refinement_samples = int(round(refinement_seconds * sample_rate))
    search_start = max(0, expected_mixture_start - refinement_samples)
    search_end = min(
        mixture_signal.size,
        expected_mixture_start + window_samples + refinement_samples,
    )
    mixture_search = mixture_signal[search_start:search_end]
    if mixture_search.size < window_samples:
        raise ValueError("reference fixture does not overlap the downloaded mixture")

    refined_correlation = _fft_cross_correlation(mixture_search, reference_window)
    refined_lags = np.arange(
        -reference_window.size + 1,
        mixture_search.size,
        dtype=np.int64,
    )
    valid_refined = np.flatnonzero(
        (refined_lags >= 0) & (refined_lags + window_samples <= mixture_search.size)
    )
    if valid_refined.size == 0:
        raise ValueError("reference fixture cannot produce a full scoring window")
    best_refined_index = int(valid_refined[np.argmax(refined_correlation[valid_refined])])
    mixture_start = search_start + int(refined_lags[best_refined_index])
    mixture_window = mixture_signal[mixture_start : mixture_start + window_samples]
    correlation = _normalized_correlation(mixture_window, reference_window)
    return AlignedStemWindow(
        mixture=mixture_window,
        reference=reference_window,
        lag_samples=mixture_start - reference_start,
        reference_start=reference_start,
        correlation=correlation,
    )


def align_known_stem_through_master(
    youtube_mix: np.ndarray,
    creator_master: np.ndarray,
    reference_stem: np.ndarray,
    *,
    sample_rate: int,
    window_seconds: float,
    max_lag_seconds: float,
) -> KnownStemBenchmarkWindow:
    """Compose YouTube-to-master and master-to-stem offsets once.

    The creator master establishes that the downloaded candidate is the pinned
    recording. A separate global offset maps the dry vocal into that master.
    The two offsets are composed before inference; predicted stems are never
    shifted independently to improve their scores.
    """
    youtube_signal = _as_finite_signal(youtube_mix, "YouTube mixture")
    master_signal = _as_finite_signal(creator_master, "creator master")
    reference_signal = _as_finite_signal(reference_stem, "reference")
    identity = align_active_reference_window(
        youtube_signal,
        master_signal,
        sample_rate=sample_rate,
        window_seconds=window_seconds,
        max_lag_seconds=max_lag_seconds,
    )
    master_to_reference = align_active_reference_window(
        master_signal,
        reference_signal,
        sample_rate=sample_rate,
        window_seconds=window_seconds,
        max_lag_seconds=max_lag_seconds,
    )
    window_samples = int(round(window_seconds * sample_rate))
    youtube_start = (
        master_to_reference.reference_start + master_to_reference.lag_samples + identity.lag_samples
    )
    youtube_end = youtube_start + window_samples
    if youtube_start < 0 or youtube_end > youtube_signal.size:
        raise ValueError("reference fixture does not overlap the downloaded mixture")
    mixture_window = youtube_signal[youtube_start:youtube_end]
    return KnownStemBenchmarkWindow(
        mixture=mixture_window,
        reference=master_to_reference.reference,
        youtube_to_master_lag_samples=identity.lag_samples,
        master_to_reference_lag_samples=master_to_reference.lag_samples,
        reference_start=master_to_reference.reference_start,
        identity_correlation=identity.correlation,
    )


def _validate_fixture_url(url: str, expected_host: str) -> None:
    """Require an HTTPS URL on the fixture's exact allowlisted host."""
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected_host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port not in (None, 443)
    ):
        raise ValueError("Untrusted reference fixture URL")


def _validate_fixture_definition(fixture: KnownStemFixture) -> None:
    """Reject path-like fields, malformed hashes, and excessive resource bounds."""
    if fixture.target_stem not in _CANONICAL_STEMS:
        raise ValueError("Untrusted reference fixture target stem")
    if (
        not fixture.reference_member.endswith(".wav")
        or "/" in fixture.reference_member
        or "\\" in fixture.reference_member
        or "\x00" in fixture.reference_member
    ):
        raise ValueError("Untrusted reference fixture member")
    hashes = (
        fixture.reference_archive_sha256,
        fixture.reference_member_sha256,
        fixture.creator_master_sha256,
    )
    if any(not re.fullmatch(r"[0-9a-f]{64}", digest) for digest in hashes):
        raise ValueError("Untrusted reference fixture SHA-256")
    if not 0 < fixture.reference_archive_bytes <= _MAX_REFERENCE_BYTES:
        raise ValueError("Untrusted reference fixture archive size")
    if not 0 < fixture.reference_member_bytes <= _MAX_REFERENCE_BYTES:
        raise ValueError("Untrusted reference fixture member size")
    if not 0 < fixture.creator_master_bytes <= _MAX_REFERENCE_BYTES:
        raise ValueError("Untrusted reference fixture master size")
    if not math.isfinite(fixture.creator_master_duration_seconds):
        raise ValueError("Untrusted reference fixture master duration")
    if fixture.creator_master_duration_seconds <= 0.0:
        raise ValueError("Untrusted reference fixture master duration")
    _validate_fixture_url(fixture.creator_master_url, fixture.creator_master_host)


def _open_fixture_url(request: Request, expected_host: str) -> Any:
    """Open a fixture URL with pre-request validation for every redirect target."""
    opener = build_opener(_AllowlistedRedirectHandler(expected_host))
    return opener.open(request, timeout=30.0)


def _validated_fixture_root(directory: Path) -> Path:
    """Return a real caller-owned directory for bounded fixture outputs."""
    root_input = Path(directory)
    if root_input.is_symlink() or not root_input.is_dir():
        raise ValueError("Untrusted reference fixture directory")
    return root_input.resolve(strict=True)


def _download_verified_file(
    *,
    url: str,
    expected_host: str,
    expected_sha256: str,
    expected_bytes: int,
    destination: Path,
) -> Path:
    """Download one exact HTTPS file with host, size, and SHA-256 checks."""
    _validate_fixture_url(url, expected_host)
    if destination.exists():
        raise ValueError("Untrusted reference fixture destination")
    request = Request(url, headers={"User-Agent": "BandScope-known-stem-benchmark/1.0"})
    try:
        with (
            _open_fixture_url(request, expected_host) as response,
            destination.open("xb") as output,
        ):
            _validate_fixture_url(response.geturl(), expected_host)
            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_bytes = int(content_length)
                except ValueError as error:
                    raise ValueError("Untrusted reference fixture byte count") from error
                if declared_bytes != expected_bytes:
                    raise ValueError("Untrusted reference fixture byte count")

            digest = hashlib.sha256()
            downloaded_bytes = 0
            while chunk := response.read(_DOWNLOAD_CHUNK_BYTES):
                downloaded_bytes += len(chunk)
                if downloaded_bytes > expected_bytes:
                    raise ValueError("Untrusted reference fixture byte count")
                digest.update(chunk)
                output.write(chunk)
            if downloaded_bytes != expected_bytes:
                raise ValueError("Untrusted reference fixture byte count")
            if digest.hexdigest() != expected_sha256:
                raise ValueError("Untrusted reference fixture SHA-256")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination


def download_verified_creator_master(fixture: KnownStemFixture, directory: Path) -> Path:
    """Download and authenticate the exact creator-hosted finished master."""
    _validate_fixture_definition(fixture)
    root = _validated_fixture_root(directory)
    return _download_verified_file(
        url=fixture.creator_master_url,
        expected_host=fixture.creator_master_host,
        expected_sha256=fixture.creator_master_sha256,
        expected_bytes=fixture.creator_master_bytes,
        destination=root / "known-reference-master.mp3",
    )


def download_verified_reference_stem(fixture: KnownStemFixture, directory: Path) -> Path:
    """Download, authenticate, and safely extract one exact reference stem.

    TLS verification remains enabled. The initial and final URL hosts are
    allowlisted, the compressed byte count and SHA-256 are exact, and only the
    named ZIP member with its expected uncompressed size is streamed out.
    """
    _validate_fixture_definition(fixture)
    root = _validated_fixture_root(directory)
    archive_path = root / "known-reference-source.zip"
    destination = root / f"known-reference-{fixture.target_stem}.wav"
    if archive_path.exists() or destination.exists():
        raise ValueError("Untrusted reference fixture destination")
    try:
        _download_verified_file(
            url=fixture.reference_archive_url,
            expected_host=fixture.reference_archive_host,
            expected_sha256=fixture.reference_archive_sha256,
            expected_bytes=fixture.reference_archive_bytes,
            destination=archive_path,
        )

        with zipfile.ZipFile(archive_path) as source_archive:
            members = [
                member
                for member in source_archive.infolist()
                if member.filename == fixture.reference_member
            ]
            if len(members) != 1:
                raise ValueError("Untrusted reference fixture member")
            member = members[0]
            if (
                member.is_dir()
                or member.flag_bits & 0x1
                or member.file_size != fixture.reference_member_bytes
            ):
                raise ValueError("Untrusted reference fixture member size")

            extracted_digest = hashlib.sha256()
            extracted_bytes = 0
            with source_archive.open(member, "r") as source, destination.open("xb") as output:
                while chunk := source.read(_DOWNLOAD_CHUNK_BYTES):
                    extracted_bytes += len(chunk)
                    if extracted_bytes > fixture.reference_member_bytes:
                        raise ValueError("Untrusted reference fixture member size")
                    extracted_digest.update(chunk)
                    output.write(chunk)
            if extracted_bytes != fixture.reference_member_bytes:
                raise ValueError("Untrusted reference fixture member size")
            if extracted_digest.hexdigest() != fixture.reference_member_sha256:
                raise ValueError("Untrusted reference fixture SHA-256")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        archive_path.unlink(missing_ok=True)
    return destination
