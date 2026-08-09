"""Tests for the opt-in YouTube known-stem separation benchmark."""

from __future__ import annotations

import hashlib
import io
import os
import tempfile
import zipfile
from dataclasses import replace
from pathlib import Path
from urllib.request import Request

import numpy as np
import pytest
import soundfile as sf
from known_stem_benchmark import (
    BRAD_SUCKS_FIXTURE,
    MAX_MASTER_DURATION_DRIFT_SECONDS,
    MIN_MASTER_IDENTITY_CORRELATION,
    MIN_VOCAL_ASSIGNMENT_MARGIN_DB,
    MIN_VOCAL_SI_SDR_IMPROVEMENT_DB,
    KnownStemFixture,
    _AllowlistedRedirectHandler,
    _normalized_correlation,
    align_active_reference_window,
    align_known_stem_through_master,
    download_verified_creator_master,
    download_verified_reference_stem,
    si_sdr_improvement,
    zero_mean_si_sdr,
)

from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)
from bandscope_analysis.youtube import _verified_ffmpeg_location, download_youtube_audio


class _FakeResponse(io.BytesIO):
    """Provide the small subset of an HTTPS response used by the fixture loader."""

    def __init__(self, payload: bytes, final_url: str) -> None:
        """Initialize a response with stable headers and a final URL."""
        super().__init__(payload)
        self.headers = {"Content-Length": str(len(payload))}
        self._final_url = final_url

    def geturl(self) -> str:
        """Return the URL after redirects."""
        return self._final_url


def _archive_payload(
    member_name: str,
    member_payload: bytes,
    *,
    extra_members: dict[str, bytes] | None = None,
) -> bytes:
    """Build a small in-memory ZIP archive for reference-integrity tests."""
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for extra_name, extra_payload in (extra_members or {}).items():
            archive.writestr(extra_name, extra_payload)
        archive.writestr(member_name, member_payload)
    return payload.getvalue()


def _fixture_for_archive(payload: bytes, *, member_payload: bytes) -> KnownStemFixture:
    """Return a fixture definition whose integrity values match a test archive."""
    return KnownStemFixture(
        youtube_url="https://www.youtube.com/watch?v=e4pIpWVbMKs",
        video_id="e4pIpWVbMKs",
        reference_archive_url="https://fixtures.example/reference.zip",
        reference_archive_host="fixtures.example",
        reference_archive_sha256=hashlib.sha256(payload).hexdigest(),
        reference_archive_bytes=len(payload),
        reference_member="vocals.wav",
        reference_member_sha256=hashlib.sha256(member_payload).hexdigest(),
        reference_member_bytes=len(member_payload),
        creator_master_url="https://fixtures.example/master.mp3",
        creator_master_host="fixtures.example",
        creator_master_sha256=hashlib.sha256(b"creator master").hexdigest(),
        creator_master_bytes=len(b"creator master"),
        creator_master_duration_seconds=4.0,
        target_stem="vocals",
    )


def test_zero_mean_si_sdr_improvement_rewards_a_cleaner_estimate() -> None:
    """Measure separation improvement relative to returning the mixture unchanged."""
    sample_rate = 8_000
    time = np.arange(sample_rate * 2, dtype=np.float64) / sample_rate
    reference = np.sin(2 * np.pi * 223.0 * time)
    interference = 0.9 * np.sin(2 * np.pi * 997.0 * time + 0.3)
    mixture = reference + interference
    estimate = reference + 0.05 * interference

    improvement = si_sdr_improvement(estimate, mixture, reference)

    assert improvement > 20.0
    assert zero_mean_si_sdr(estimate, reference) > zero_mean_si_sdr(mixture, reference)


@pytest.mark.parametrize(
    ("estimate", "reference", "message"),
    [
        (np.array([0.0, np.nan, 1.0]), np.ones(3), "finite"),
        (np.zeros(8), np.arange(8, dtype=np.float64), "estimate.*energy"),
        (np.ones(8), np.ones(8), "reference.*energy"),
    ],
)
def test_zero_mean_si_sdr_rejects_invalid_signals(
    estimate: np.ndarray, reference: np.ndarray, message: str
) -> None:
    """Reject non-finite and effectively silent benchmark inputs."""
    with pytest.raises(ValueError, match=message):
        zero_mean_si_sdr(estimate, reference)


def test_align_active_reference_window_recovers_delay_and_loud_section() -> None:
    """Use one global offset to align a known stem with a delayed mixture."""
    rng = np.random.default_rng(20260809)
    sample_rate = 1_000
    reference = np.zeros(4_000, dtype=np.float64)
    reference[700:1_700] = 0.25 * rng.standard_normal(1_000)
    reference[2_200:3_200] = rng.standard_normal(1_000)
    lag_samples = 137
    mixture = 0.01 * rng.standard_normal(reference.size + 300)
    mixture[lag_samples : lag_samples + reference.size] += reference

    aligned = align_active_reference_window(
        mixture,
        reference,
        sample_rate=sample_rate,
        window_seconds=0.8,
        max_lag_seconds=0.5,
        envelope_hop_seconds=0.02,
        refinement_seconds=0.08,
    )

    assert aligned.lag_samples == lag_samples
    assert aligned.reference_start >= 2_100
    assert aligned.reference_start <= 2_400
    assert aligned.mixture.shape == aligned.reference.shape == (800,)
    assert aligned.correlation > 0.99


def test_identity_correlation_preserves_phase_sign() -> None:
    """Do not authenticate a phase-inverted candidate as the same recording."""
    signal = np.array([-2.0, -0.5, 0.5, 2.0], dtype=np.float64)

    assert _normalized_correlation(signal, -signal) == pytest.approx(-1.0)


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"sample_rate": 0}, "sample_rate must be positive"),
        ({"window_seconds": 0.0}, "alignment durations are invalid"),
        ({"max_lag_seconds": -0.1}, "alignment durations are invalid"),
        ({"envelope_hop_seconds": 0.0}, "alignment resolution is invalid"),
        ({"refinement_seconds": -0.1}, "alignment resolution is invalid"),
        ({"window_seconds": 2.0}, "reference is shorter"),
    ],
)
def test_align_active_reference_window_rejects_invalid_contract(
    kwargs: dict[str, float | int], message: str
) -> None:
    """Exercise every caller-controlled alignment validation family."""
    parameters: dict[str, float | int] = {
        "sample_rate": 10,
        "window_seconds": 0.5,
        "max_lag_seconds": 0.2,
        "envelope_hop_seconds": 0.1,
        "refinement_seconds": 0.1,
    }
    parameters.update(kwargs)

    with pytest.raises(ValueError, match=message):
        align_active_reference_window(
            np.arange(10, dtype=np.float64),
            np.arange(10, dtype=np.float64),
            **parameters,
        )


def test_download_verified_reference_stem_extracts_only_the_pinned_member(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Accept an exact HTTPS archive and extract only its expected stem member."""
    member_payload = b"known vocal stem"
    unexpected_name = "bandscope-zip-slip-must-not-exist"
    archive_payload = _archive_payload(
        "vocals.wav",
        member_payload,
        extra_members={f"../{unexpected_name}": b"untrusted extra member"},
    )
    fixture = _fixture_for_archive(archive_payload, member_payload=member_payload)

    def fake_open_fixture_url(request: object, expected_host: str) -> _FakeResponse:
        """Return the pinned archive without using the network."""
        assert expected_host == fixture.reference_archive_host
        return _FakeResponse(archive_payload, fixture.reference_archive_url)

    monkeypatch.setattr("known_stem_benchmark._open_fixture_url", fake_open_fixture_url)

    extracted = download_verified_reference_stem(fixture, tmp_path)

    assert extracted == tmp_path / "known-reference-vocals.wav"
    assert extracted.read_bytes() == member_payload
    assert not (tmp_path / "known-reference-source.zip").exists()
    assert not (tmp_path.parent / unexpected_name).exists()


def test_reference_redirect_handler_rejects_off_host_before_following() -> None:
    """Reject an off-host HTTPS redirect before creating its follow-up request."""
    handler = _AllowlistedRedirectHandler("fixtures.example")
    original = Request("https://fixtures.example/reference.zip")

    with pytest.raises(ValueError, match="reference fixture URL"):
        handler.redirect_request(
            original,
            None,
            302,
            "Found",
            {},
            "https://169.254.169.254/latest/meta-data",
        )


@pytest.mark.parametrize("failure", ["hash", "redirect", "member-hash", "member-size"])
def test_download_verified_reference_stem_rejects_untrusted_archive_data(
    failure: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail closed for changed bytes, insecure redirects, and ZIP size drift."""
    member_payload = b"known vocal stem"
    archive_payload = _archive_payload("vocals.wav", member_payload)
    fixture = _fixture_for_archive(archive_payload, member_payload=member_payload)
    if failure == "hash":
        fixture = replace(fixture, reference_archive_sha256="0" * 64)
    if failure == "member-hash":
        fixture = replace(fixture, reference_member_sha256="0" * 64)
    if failure == "member-size":
        fixture = replace(fixture, reference_member_bytes=len(member_payload) + 1)
    final_url = (
        "http://fixtures.example/reference.zip"
        if failure == "redirect"
        else fixture.reference_archive_url
    )

    def fake_open_fixture_url(request: object, expected_host: str) -> _FakeResponse:
        """Return controlled archive bytes for a negative integrity test."""
        return _FakeResponse(archive_payload, final_url)

    monkeypatch.setattr("known_stem_benchmark._open_fixture_url", fake_open_fixture_url)

    with pytest.raises(ValueError, match="reference fixture"):
        download_verified_reference_stem(fixture, tmp_path)

    assert not (tmp_path / "known-reference-source.zip").exists()
    assert not (tmp_path / "known-reference-vocals.wav").exists()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("target_stem", "../outside"),
        ("reference_member", "../vocals.wav"),
        ("reference_archive_bytes", 65 * 1024 * 1024),
    ],
)
def test_download_verified_reference_stem_rejects_unsafe_fixture_definition(
    field: str,
    value: str | int,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject unsafe path fields and resource bounds before opening a URL."""
    member_payload = b"known vocal stem"
    archive_payload = _archive_payload("vocals.wav", member_payload)
    fixture = replace(
        _fixture_for_archive(archive_payload, member_payload=member_payload),
        **{field: value},
    )
    network_opened = False

    def fake_open_fixture_url(request: object, expected_host: str) -> _FakeResponse:
        """Record an unexpected network request from invalid fixture data."""
        nonlocal network_opened
        network_opened = True
        return _FakeResponse(archive_payload, fixture.reference_archive_url)

    monkeypatch.setattr("known_stem_benchmark._open_fixture_url", fake_open_fixture_url)

    with pytest.raises(ValueError, match="reference fixture"):
        download_verified_reference_stem(fixture, tmp_path)

    assert network_opened is False


def test_download_verified_creator_master_authenticates_exact_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Authenticate the creator master independently from the dry vocal archive."""
    member_payload = b"known vocal stem"
    archive_payload = _archive_payload("vocals.wav", member_payload)
    master_payload = b"exact creator master"
    fixture = replace(
        _fixture_for_archive(archive_payload, member_payload=member_payload),
        creator_master_sha256=hashlib.sha256(master_payload).hexdigest(),
        creator_master_bytes=len(master_payload),
    )

    def fake_open_fixture_url(request: object, expected_host: str) -> _FakeResponse:
        """Return the pinned creator master without using the network."""
        assert expected_host == fixture.creator_master_host
        return _FakeResponse(master_payload, fixture.creator_master_url)

    monkeypatch.setattr("known_stem_benchmark._open_fixture_url", fake_open_fixture_url)

    master_path = download_verified_creator_master(fixture, tmp_path)

    assert master_path == tmp_path / "known-reference-master.mp3"
    assert master_path.read_bytes() == master_payload


def test_align_known_stem_through_master_composes_two_global_offsets() -> None:
    """Use creator-master identity and vocal alignment without shifting model outputs."""
    rng = np.random.default_rng(20260809)
    sample_rate = 1_000
    reference = np.zeros(4_000, dtype=np.float64)
    reference[2_000:3_000] = rng.standard_normal(1_000)
    master_lag = 123
    master = 0.001 * rng.standard_normal(4_500)
    master[master_lag : master_lag + reference.size] += reference
    youtube_lag = 211
    youtube = 0.001 * rng.standard_normal(5_000)
    youtube[youtube_lag : youtube_lag + master.size] += master

    aligned = align_known_stem_through_master(
        youtube,
        master,
        reference,
        sample_rate=sample_rate,
        window_seconds=0.8,
        max_lag_seconds=0.5,
    )

    assert aligned.youtube_to_master_lag_samples == youtube_lag
    assert aligned.master_to_reference_lag_samples == master_lag
    assert aligned.identity_correlation > 0.99
    assert aligned.mixture.shape == aligned.reference.shape == (800,)
    expected_start = aligned.reference_start + master_lag + youtube_lag
    np.testing.assert_allclose(aligned.mixture, youtube[expected_start : expected_start + 800])


def test_required_root_suite_explicitly_excludes_live_youtube_marker() -> None:
    """Keep external YouTube access out of required CI while retaining offline tests."""
    repo_root = Path(__file__).resolve().parents[3]
    runner = (repo_root / "scripts/checks/run_root_tests.mjs").read_text(encoding="utf-8")

    normalized = " ".join(runner.split())
    assert '"-m", "not youtube_stem_e2e"' in normalized


def test_live_benchmark_requires_verified_ffmpeg_before_fixture_access(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fail closed before network access when executable identity is not configured."""
    monkeypatch.delenv("BANDSCOPE_FFMPEG_PATH", raising=False)
    monkeypatch.delenv("BANDSCOPE_FFMPEG_SHA256", raising=False)

    with pytest.raises(AssertionError, match="verified ffmpeg identity"):
        _assert_real_youtube_known_stem_separation(tmp_path)


def _assert_real_youtube_known_stem_separation(root: Path) -> None:
    """Run the live benchmark inside an ephemeral, caller-owned media directory."""
    ffmpeg_location = _verified_ffmpeg_location()
    assert ffmpeg_location is not None, (
        "Live benchmark requires verified ffmpeg identity via "
        "BANDSCOPE_FFMPEG_PATH and BANDSCOPE_FFMPEG_SHA256"
    )
    fixture = BRAD_SUCKS_FIXTURE
    reference_path = download_verified_reference_stem(fixture, root)
    master_path = download_verified_creator_master(fixture, root)
    youtube_dir = root / "youtube"
    youtube_dir.mkdir()

    download = download_youtube_audio(fixture.youtube_url, str(youtube_dir))
    assert download["ok"], f"YouTube fixture failed: {download.get('error', {}).get('code')}"
    metadata = download["metadata"]
    assert metadata["id"] == fixture.video_id
    mixture_path = Path(metadata["filepath"]).resolve(strict=True)
    assert mixture_path.is_relative_to(youtube_dir.resolve())

    import librosa

    mixture, sample_rate = librosa.load(mixture_path, sr=44_100, mono=True)
    creator_master, master_sample_rate = librosa.load(master_path, sr=44_100, mono=True)
    reference, reference_sample_rate = librosa.load(reference_path, sr=44_100, mono=True)
    assert sample_rate == master_sample_rate == reference_sample_rate == 44_100
    decoded_master_duration = creator_master.size / sample_rate
    assert abs(decoded_master_duration - fixture.creator_master_duration_seconds) <= 0.05, (
        "Pinned creator-master decode duration drifted"
    )
    duration_drift = abs((mixture.size - creator_master.size) / sample_rate)
    assert duration_drift <= MAX_MASTER_DURATION_DRIFT_SECONDS, (
        f"YouTube/master duration drift was {duration_drift:.3f} s"
    )
    aligned = align_known_stem_through_master(
        mixture,
        creator_master,
        reference,
        sample_rate=sample_rate,
        window_seconds=12.0,
        max_lag_seconds=10.0,
    )
    assert aligned.identity_correlation >= MIN_MASTER_IDENTITY_CORRELATION, (
        f"YouTube/master identity correlation was only {aligned.identity_correlation:.4f}"
    )

    scored_mix_path = root / "youtube-known-stem-window.wav"
    sf.write(scored_mix_path, aligned.mixture, sample_rate, subtype="PCM_24")
    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_file_bytes=10 * 1024 * 1024,
            max_duration_seconds=13.0,
            shifts=0,
        )
    )
    separation = separator.separate(scored_mix_path)
    stems = separation["stems"]

    assert set(stems) == {"vocals", "bass", "drums", "other"}
    assert all(stem.shape == aligned.reference.shape for stem in stems.values())
    assert all(np.isfinite(stem).all() for stem in stems.values())

    scores = {name: zero_mean_si_sdr(stem, aligned.reference) for name, stem in stems.items()}
    assert np.isfinite(np.asarray(list(scores.values()))).all(), "Stem SI-SDR was non-finite"
    vocal_score = scores["vocals"]
    best_wrong_score = max(score for name, score in scores.items() if name != "vocals")
    improvement = si_sdr_improvement(stems["vocals"], aligned.mixture, aligned.reference)
    assignment_margin = vocal_score - best_wrong_score
    evidence = (
        f"video={fixture.video_id}; model=htdemucs/955717e8-8726e21a; "
        f"identity_correlation={aligned.identity_correlation:.4f}; "
        f"youtube_master_lag={aligned.youtube_to_master_lag_samples}; "
        f"master_vocal_lag={aligned.master_to_reference_lag_samples}; "
        f"si_sdri={improvement:.3f}dB; assignment_margin={assignment_margin:.3f}dB"
    )

    assert np.isfinite(improvement), "Vocal SI-SDR improvement was non-finite"
    assert np.isfinite(assignment_margin), "Vocal stem assignment margin was non-finite"
    assert improvement >= MIN_VOCAL_SI_SDR_IMPROVEMENT_DB, (
        f"Vocal SI-SDR improvement missed the provisional threshold; {evidence}"
    )
    assert assignment_margin >= MIN_VOCAL_ASSIGNMENT_MARGIN_DB, (
        f"Vocal stem assignment margin missed the provisional threshold; {evidence}"
    )


@pytest.mark.youtube_stem_e2e
@pytest.mark.skipif(
    os.environ.get("BANDSCOPE_RUN_YOUTUBE_STEM_E2E") != "1",
    reason=(
        "live YouTube, the pinned public stem archive, ffmpeg, and Demucs weights are required; "
        "set BANDSCOPE_RUN_YOUTUBE_STEM_E2E=1"
    ),
)
def test_real_youtube_audio_separates_the_known_vocal_stem(tmp_path: Path) -> None:
    """Download a real YouTube mix and verify Demucs against its known vocal stem."""
    with tempfile.TemporaryDirectory(prefix="known-stem-media-", dir=tmp_path) as media_dir:
        _assert_real_youtube_known_stem_separation(Path(media_dir))

    assert not any(tmp_path.iterdir())
