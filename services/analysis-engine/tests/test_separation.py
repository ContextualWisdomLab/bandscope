"""Tests for the source separation module."""

import hashlib
import sys
import types

import numpy as np
import pytest
import soundfile as sf

from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)
from bandscope_analysis.separation.lightweight_model import (
    LightweightSpectralModelConfig,
    LightweightSpectralStemModel,
    _largest_power_of_two,
    _pad_to_min_length,
)
from bandscope_analysis.separation.model import StemCategory
from bandscope_analysis.separation.separator import StemSeparator, _categorize_role
from bandscope_analysis.separation.weights import (
    ModelWeightSpec,
    default_model_cache_dir,
    download_model_weights,
    ensure_verified_model_weights,
    verify_model_weights,
)


def test_stem_category_enum() -> None:
    """Verify StemCategory enum values match the domain requirements."""
    assert StemCategory.VOCALS.value == "vocals"
    assert StemCategory.BASS.value == "bass"
    assert StemCategory.DRUMS.value == "drums"
    assert StemCategory.KEYS.value == "keys"
    assert StemCategory.GUITAR.value == "guitar"
    assert StemCategory.OTHER.value == "other"


def test_categorize_role_vocal() -> None:
    """Test vocal role type is categorized correctly."""
    assert _categorize_role("lead-vocal", "Lead Vocal", "vocal") == StemCategory.VOCALS


def test_categorize_role_bass() -> None:
    """Test bass instrument role is categorized correctly."""
    assert _categorize_role("bass-guitar", "Bass Guitar", "instrument") == StemCategory.BASS


def test_categorize_role_keys() -> None:
    """Test keyboard role is categorized correctly."""
    assert _categorize_role("keys-right", "Keyboard 1 Right Hand", "hand") == StemCategory.KEYS


def test_categorize_role_piano() -> None:
    """Test piano role is categorized correctly."""
    assert _categorize_role("piano-1", "Piano", "instrument") == StemCategory.KEYS


def test_categorize_role_guitar() -> None:
    """Test guitar role is categorized correctly."""
    assert _categorize_role("guitar-1", "Electric Guitar", "instrument") == StemCategory.GUITAR


def test_categorize_role_drums() -> None:
    """Test drum role is categorized correctly."""
    assert _categorize_role("drum-kit", "Drum Kit", "instrument") == StemCategory.DRUMS


def test_categorize_role_other() -> None:
    """Test unknown role type is categorized as other."""
    assert _categorize_role("synth-pad", "Synth Pad", "instrument") == StemCategory.OTHER


def test_stem_separator_empty() -> None:
    """Test separator with empty roles list."""
    separator = StemSeparator()
    result = separator.separate([])
    assert result["stems"] == []
    assert "0 roles" in result["separation_notes"]


def test_stem_separator_basic() -> None:
    """Test separator with typical roles."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "lead-vocal", "name": "Lead Vocal", "roleType": "vocal"},
        {"id": "keys-right", "name": "Keyboard Right Hand", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 3
    stems_by_id = {s["stem_id"]: s for s in result["stems"]}
    assert stems_by_id["stem-bass-guitar"]["category"] == "bass"
    assert stems_by_id["stem-lead-vocal"]["category"] == "vocals"
    assert stems_by_id["stem-keys-right"]["category"] == "keys"


def test_stem_separator_deduplicates() -> None:
    """Test separator deduplicates roles by id."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
    ]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1


def test_stem_separator_invalid_role() -> None:
    """Test separator handles non-dict roles gracefully."""
    separator = StemSeparator()
    result = separator.separate(
        [{"id": "bass", "name": "Bass", "roleType": "instrument"}, "invalid"]
    )
    assert len(result["stems"]) == 1


def test_stem_separator_confidence() -> None:
    """Test confidence levels based on role types."""
    separator = StemSeparator()
    roles = [
        {"id": "bass-guitar", "name": "Bass Guitar", "roleType": "instrument"},
        {"id": "keys-left", "name": "Keys Left", "roleType": "hand"},
    ]
    result = separator.separate(roles)
    # instrument gets high, hand gets medium
    assert result["stems"][0]["confidence"] == "high"
    assert result["stems"][1]["confidence"] == "medium"


def test_stem_separator_missing_role_fields() -> None:
    """Test separator handles roles with missing fields."""
    separator = StemSeparator()
    roles = [{"id": "unknown-1"}]
    result = separator.separate(roles)
    assert len(result["stems"]) == 1
    assert result["stems"][0]["category"] == "other"
    # When name is missing, label falls back to role id
    assert result["stems"][0]["label"] == "unknown-1"


def test_stem_separator_keyboard_name_match() -> None:
    """Test separator categorizes keyboard by name even without keys in id."""
    separator = StemSeparator()
    roles = [{"id": "synth-1", "name": "Keyboard Part", "roleType": "instrument"}]
    result = separator.separate(roles)
    assert result["stems"][0]["category"] == "keys"


def test_audio_stem_separator_splits_local_audio_into_chunked_stems(tmp_path) -> None:
    """Ensure local audio is separated into downstream-consumable canonical stems."""
    sample_rate = 8_000
    duration_seconds = 0.8
    samples = int(sample_rate * duration_seconds)
    times = np.arange(samples, dtype=np.float32) / sample_rate
    click_track = np.zeros(samples, dtype=np.float32)
    click_track[:: sample_rate // 4] = 0.8
    mix = (
        0.35 * np.sin(2 * np.pi * 82.0 * times)
        + 0.25 * np.sin(2 * np.pi * 880.0 * times)
        + click_track
    ).astype(np.float32)
    audio_path = tmp_path / "rehearsal.wav"
    sf.write(audio_path, mix, sample_rate)

    separator = AudioStemSeparator(
        AudioSeparationConfig(
            target_sample_rate=sample_rate,
            chunk_duration_seconds=0.25,
            max_duration_seconds=1.0,
            max_file_bytes=1_000_000,
        )
    )

    result = separator.separate(audio_path)

    assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
    assert result["sample_rate"] == sample_rate
    assert result["duration_seconds"] == pytest.approx(duration_seconds)
    assert result["chunk_count"] == 4
    assert "4 chunks" in result["separation_notes"]
    assert "using cpu" in result["separation_notes"]
    assert str(tmp_path) not in result["separation_notes"]
    for stem in result["stems"].values():
        assert stem.shape == (samples,)
        assert np.isfinite(stem).all()
    assert np.any(np.abs(result["stems"]["bass"]) > 0)
    assert np.any(np.abs(result["stems"]["drums"]) > 0)


def test_audio_stem_separator_returns_finite_stems_for_single_tone() -> None:
    """Ensure the local spectral model returns bounded, finite stem arrays."""
    sample_rate = 8_000
    samples = 800
    times = np.arange(samples, dtype=np.float32) / sample_rate
    tone = np.sin(2 * np.pi * 440.0 * times).astype(np.float32)
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=sample_rate))

    stems = separator._separate_chunk(tone, sample_rate)

    for stem in stems.values():
        assert stem.shape == (samples,)
        assert np.isfinite(stem).all()
    summed = stems["vocals"] + stems["bass"] + stems["drums"] + stems["other"]
    assert float(np.max(np.abs(summed))) > 0


def test_audio_stem_separator_rejects_missing_audio_file(tmp_path) -> None:
    """Ensure missing local files fail before decode without leaking a full path."""
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(FileNotFoundError, match="Audio file not found: missing.wav"):
        separator.separate(tmp_path / "missing.wav")


def test_audio_stem_separator_rejects_directory_source(tmp_path) -> None:
    """Ensure directories are not accepted as audio files."""
    source_dir = tmp_path / "source-dir"
    source_dir.mkdir()
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(FileNotFoundError, match="Audio file not found: source-dir"):
        separator.separate(source_dir)


def test_audio_stem_separator_rejects_oversized_audio_file(tmp_path) -> None:
    """Ensure local audio intake enforces a bounded file-size limit."""
    audio_path = tmp_path / "too-large.wav"
    audio_path.write_bytes(b"0" * 16)
    separator = AudioStemSeparator(
        AudioSeparationConfig(target_sample_rate=8_000, max_file_bytes=8)
    )

    with pytest.raises(ValueError, match="Audio file is too large for stem separation"):
        separator.separate(audio_path)


def test_audio_stem_separator_rejects_empty_decoder_output(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure empty decoder output fails safely."""
    audio_path = tmp_path / "empty.wav"
    audio_path.write_bytes(b"placeholder")
    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        lambda *args, **kwargs: (np.array([], dtype=np.float32), 8_000),
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Stem separation decode failed for empty.wav"):
        separator.separate(audio_path)


def test_audio_stem_separator_redacts_decoder_exceptions(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure decoder failures are surfaced without full local paths."""
    audio_path = tmp_path / "broken.wav"
    audio_path.write_bytes(b"placeholder")

    def fail_decode(*args, **kwargs):
        raise RuntimeError(f"decoder failed under {tmp_path}")

    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.librosa.load",
        fail_decode,
    )
    separator = AudioStemSeparator(AudioSeparationConfig(target_sample_rate=8_000))

    with pytest.raises(ValueError, match="Stem separation decode failed for broken.wav") as error:
        separator.separate(audio_path)

    assert str(tmp_path) not in str(error.value)


def test_ensure_verified_model_weights_returns_none_when_missing_without_download(
    tmp_path,
) -> None:
    """Ensure missing model artifacts do not trigger network access by default."""
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )

    result = ensure_verified_model_weights(spec, cache_dir=tmp_path, download_if_missing=False)

    assert result is None


def test_download_model_weights_rejects_non_allowlisted_hosts(tmp_path) -> None:
    """Ensure model downloads enforce host allowlists before network access."""
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://example.com/tiny.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )

    with pytest.raises(ValueError, match="allowlisted"):
        download_model_weights(spec, destination=tmp_path / spec.file_name)


def test_download_model_weights_verifies_digest(tmp_path) -> None:
    """Ensure downloaded model bytes must match the expected sha256 digest."""
    body = b"small-model"
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256=hashlib.sha256(body).hexdigest(),
        max_bytes=1024,
    )

    class FakeResponse:
        """Minimal urllib3 response stub."""

        status = 200

        def stream(self, _: int):
            yield body

        def release_conn(self) -> None:
            return None

    class FakePool:
        """Minimal urllib3 pool stub."""

        def request(self, method: str, url: str, preload_content: bool = False) -> FakeResponse:
            assert method == "GET"
            assert url == spec.source_url
            assert preload_content is False
            return FakeResponse()

    downloaded = download_model_weights(
        spec,
        destination=tmp_path / spec.file_name,
        http=FakePool(),
    )

    assert downloaded.exists()
    assert downloaded.read_bytes() == body


def test_ensure_verified_model_weights_downloads_when_enabled(tmp_path) -> None:
    """Ensure ensure helper downloads verified artifacts when explicitly enabled."""
    body = b"model-bytes"
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256=hashlib.sha256(body).hexdigest(),
        max_bytes=1024,
    )

    class FakeResponse:
        """Minimal download response stub."""

        status = 200

        def stream(self, _: int):
            yield body

        def release_conn(self) -> None:
            return None

    class FakePool:
        """Minimal urllib3 pool stub."""

        def request(self, method: str, url: str, preload_content: bool = False) -> FakeResponse:
            assert method == "GET"
            assert url == spec.source_url
            assert preload_content is False
            return FakeResponse()

    resolved = ensure_verified_model_weights(
        spec,
        cache_dir=tmp_path,
        download_if_missing=True,
        http=FakePool(),
    )

    assert resolved == tmp_path / spec.file_name
    assert resolved.read_bytes() == body


def test_default_model_cache_dir_respects_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure model cache directory uses the configured environment variable."""
    monkeypatch.setenv("BANDSCOPE_MODEL_CACHE", "/tmp/bandscope-models")

    cache_dir = default_model_cache_dir()

    assert str(cache_dir) == "/tmp/bandscope-models"


def test_verify_model_weights_rejects_wrong_filename(tmp_path) -> None:
    """Ensure model verification rejects unexpected artifact filenames."""
    body = b"model"
    digest = hashlib.sha256(body).hexdigest()
    spec = ModelWeightSpec(
        file_name="expected.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/expected.npz",
        sha256=digest,
        max_bytes=1024,
    )
    wrong_file = tmp_path / "wrong.npz"
    wrong_file.write_bytes(body)

    with pytest.raises(ValueError, match="Unexpected model artifact filename"):
        verify_model_weights(wrong_file, spec)


def test_verify_model_weights_rejects_digest_mismatch(tmp_path) -> None:
    """Ensure model verification fails when bytes do not match expected digest."""
    spec = ModelWeightSpec(
        file_name="expected.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/expected.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )
    path = tmp_path / spec.file_name
    path.write_bytes(b"different")

    with pytest.raises(ValueError, match="digest mismatch"):
        verify_model_weights(path, spec)


def test_ensure_verified_model_weights_returns_existing_verified_file(tmp_path) -> None:
    """Ensure existing verified model artifacts are reused without downloading."""
    body = b"model"
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256=hashlib.sha256(body).hexdigest(),
        max_bytes=1024,
    )
    model_path = tmp_path / spec.file_name
    model_path.write_bytes(body)

    resolved = ensure_verified_model_weights(spec, cache_dir=tmp_path, download_if_missing=False)

    assert resolved == model_path


def test_download_model_weights_rejects_non_https(tmp_path) -> None:
    """Ensure model downloads require HTTPS transport."""
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="http://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )

    with pytest.raises(ValueError, match="HTTPS"):
        download_model_weights(spec, destination=tmp_path / spec.file_name)


def test_download_model_weights_rejects_invalid_sha(tmp_path) -> None:
    """Ensure malformed digests are rejected before any network call."""
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256="abc",
        max_bytes=1024,
    )

    with pytest.raises(ValueError, match="lower-case 64-char"):
        download_model_weights(spec, destination=tmp_path / spec.file_name)


def test_download_model_weights_rejects_http_status(tmp_path) -> None:
    """Ensure failed HTTP status codes are surfaced as safe failures."""
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )

    class FakeResponse:
        """Minimal failure response stub."""

        status = 404

        def stream(self, _: int):
            return iter(())

        def release_conn(self) -> None:
            return None

    class FakePool:
        """Minimal urllib3 pool stub."""

        def request(self, method: str, url: str, preload_content: bool = False) -> FakeResponse:
            assert method == "GET"
            assert url == spec.source_url
            assert preload_content is False
            return FakeResponse()

    with pytest.raises(ValueError, match="HTTP 404"):
        download_model_weights(spec, destination=tmp_path / spec.file_name, http=FakePool())


def test_download_model_weights_rejects_size_limit(tmp_path) -> None:
    """Ensure download streaming enforces max artifact size."""
    body = b"abcde"
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256=hashlib.sha256(body).hexdigest(),
        max_bytes=4,
    )

    class FakeResponse:
        """Minimal oversized response stub."""

        status = 200

        def stream(self, _: int):
            yield b""
            yield body

        def release_conn(self) -> None:
            return None

    class FakePool:
        """Minimal urllib3 pool stub."""

        def request(self, method: str, url: str, preload_content: bool = False) -> FakeResponse:
            assert method == "GET"
            assert url == spec.source_url
            assert preload_content is False
            return FakeResponse()

    with pytest.raises(ValueError, match="maximum download size"):
        download_model_weights(spec, destination=tmp_path / spec.file_name, http=FakePool())
    assert not (tmp_path / spec.file_name).exists()
    assert not (tmp_path / f"{spec.file_name}.tmp").exists()


def test_download_model_weights_rejects_digest_mismatch(tmp_path) -> None:
    """Ensure streamed download digest mismatches are rejected and cleaned up."""
    body = b"different"
    spec = ModelWeightSpec(
        file_name="tiny.npz",
        source_url="https://github.com/Seongho-Bae/bandscope/releases/download/model-assets/tiny.npz",
        sha256="0" * 64,
        max_bytes=1024,
    )

    class FakeResponse:
        """Minimal response stub."""

        status = 200

        def stream(self, _: int):
            yield body

        def release_conn(self) -> None:
            return None

    class FakePool:
        """Minimal urllib3 pool stub."""

        def request(self, method: str, url: str, preload_content: bool = False) -> FakeResponse:
            assert method == "GET"
            assert url == spec.source_url
            assert preload_content is False
            return FakeResponse()

    with pytest.raises(ValueError, match="digest mismatch"):
        download_model_weights(spec, destination=tmp_path / spec.file_name, http=FakePool())
    assert not (tmp_path / spec.file_name).exists()


def test_audio_stem_separator_resolves_explicit_compute_device() -> None:
    """Ensure explicit device preferences bypass auto detection."""
    separator = AudioStemSeparator(AudioSeparationConfig(compute_device="mps"))

    assert separator._resolve_compute_device("cuda") == "cuda"
    assert separator._compute_device == "mps"


def test_audio_stem_separator_auto_device_prefers_cuda(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure auto mode picks CUDA when a torch backend advertises it."""

    class FakeCuda:
        """CUDA stub."""

        @staticmethod
        def is_available() -> bool:
            return True

    class FakeMps:
        """MPS stub."""

        @staticmethod
        def is_available() -> bool:
            return False

    fake_torch = types.SimpleNamespace(
        cuda=FakeCuda(),
        backends=types.SimpleNamespace(mps=FakeMps()),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    separator = AudioStemSeparator(AudioSeparationConfig(compute_device="auto"))

    assert separator._compute_device == "cuda"


def test_audio_stem_separator_auto_device_prefers_mps_when_cuda_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure auto mode falls back to MPS when CUDA is unavailable."""

    class FakeCuda:
        """CUDA stub."""

        @staticmethod
        def is_available() -> bool:
            return False

    class FakeMps:
        """MPS stub."""

        @staticmethod
        def is_available() -> bool:
            return True

    fake_torch = types.SimpleNamespace(
        cuda=FakeCuda(),
        backends=types.SimpleNamespace(mps=FakeMps()),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    separator = AudioStemSeparator(AudioSeparationConfig(compute_device="auto"))

    assert separator._compute_device == "mps"


def test_audio_stem_separator_auto_device_falls_back_to_cpu_when_no_accelerator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure auto mode resolves to CPU when torch is available without accelerators."""

    class FakeCuda:
        """CUDA stub."""

        @staticmethod
        def is_available() -> bool:
            return False

    class FakeMps:
        """MPS stub."""

        @staticmethod
        def is_available() -> bool:
            return False

    fake_torch = types.SimpleNamespace(
        cuda=FakeCuda(),
        backends=types.SimpleNamespace(mps=FakeMps()),
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    separator = AudioStemSeparator(AudioSeparationConfig(compute_device="auto"))

    assert separator._compute_device == "cpu"


def test_audio_stem_separator_auto_device_handles_import_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure auto mode safely falls back to CPU when torch import fails."""
    monkeypatch.setitem(sys.modules, "torch", None)
    original_import = __import__

    def fail_import(name: str, globals=None, locals=None, fromlist=(), level=0):
        if name == "torch":
            raise ImportError("missing torch")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", fail_import)
    separator = AudioStemSeparator(AudioSeparationConfig(compute_device="auto"))

    assert separator._compute_device == "cpu"


def test_lightweight_model_handles_empty_and_zero_chunks() -> None:
    """Ensure the lightweight model covers empty and all-zero chunk paths."""
    model = LightweightSpectralStemModel(
        config=LightweightSpectralModelConfig(n_fft=64, nmf_iterations=1)
    )
    empty = model.separate_chunk(np.array([], dtype=np.float32), sample_rate=8_000)
    zero = model.separate_chunk(np.zeros(128, dtype=np.float32), sample_rate=8_000)

    assert all(stem.size == 0 for stem in empty.values())
    assert all(np.allclose(stem, 0.0) for stem in zero.values())


def test_lightweight_model_uses_band_fallback_for_low_rank_nmf() -> None:
    """Ensure low-rank NMF triggers deterministic band fallback splitting."""
    model = LightweightSpectralStemModel(
        config=LightweightSpectralModelConfig(n_fft=64, nmf_components=2, nmf_iterations=1)
    )
    chunk = np.sin(2 * np.pi * 220.0 * np.arange(128, dtype=np.float32) / 8_000).astype(np.float32)
    stems = model.separate_chunk(chunk, sample_rate=8_000)

    assert set(stems) == {"vocals", "bass", "drums", "other"}
    assert all(stem.shape == (128,) for stem in stems.values())


def test_largest_power_of_two_handles_non_positive_values() -> None:
    """Ensure helper returns zero for non-positive values."""
    assert _largest_power_of_two(0) == 0
    assert _largest_power_of_two(-3) == 0


def test_pad_to_min_length_extends_short_chunks() -> None:
    """Ensure helper pads short chunks to the requested minimum length."""
    chunk = np.array([1.0, -1.0], dtype=np.float32)

    padded = _pad_to_min_length(chunk, 5)

    assert padded.shape == (5,)
    assert np.allclose(padded[:2], chunk)
    assert np.allclose(padded[2:], 0.0)


def test_default_model_cache_dir_uses_home_when_env_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ensure default model cache falls back under the user home directory."""
    monkeypatch.delenv("BANDSCOPE_MODEL_CACHE", raising=False)

    cache_dir = default_model_cache_dir()

    assert str(cache_dir).endswith(".cache/bandscope/models")
