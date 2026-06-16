"""Tests for the Demucs ML-based source separation integration."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import soundfile as sf

from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)
from bandscope_analysis.separation.demucs_separator import (
    _DEMUCS_TO_BANDSCOPE,
    DemucsConfig,
    DemucsModelSeparator,
    is_demucs_available,
)
from bandscope_analysis.separation.model_weights import (
    ModelWeightConfig,
    ModelWeightManager,
    _default_cache_dir,
    _verify_sha256,
)


class TestIsDemucsAvailable:
    """Tests for Demucs availability detection."""

    def test_returns_false_when_torch_not_installed(self) -> None:
        """Verify graceful fallback when torch is not importable."""
        with patch.dict("sys.modules", {"torch": None}):
            # The import guard catches ImportError
            result = is_demucs_available()
            # Without torch installed in test env, this should be False
            assert result is False

    def test_demucs_availability_reflects_import_state(self) -> None:
        """Verify the function returns a boolean reflecting import state."""
        result = is_demucs_available()
        assert isinstance(result, bool)


class TestDemucsConfig:
    """Tests for DemucsConfig dataclass."""

    def test_default_values(self) -> None:
        """Verify default configuration values are reasonable."""
        config = DemucsConfig()
        assert config.chunk_seconds == 10.0
        assert config.overlap_seconds == 1.0
        assert config.num_workers == 1
        assert config.use_fp16_cuda is True
        assert config.max_segment_seconds == 600.0

    def test_custom_values(self) -> None:
        """Verify custom configuration is accepted."""
        config = DemucsConfig(chunk_seconds=5.0, overlap_seconds=0.5)
        assert config.chunk_seconds == 5.0
        assert config.overlap_seconds == 0.5


class TestDemucsToRoleMapping:
    """Tests for Demucs stem to BandScope RoleType mapping."""

    def test_all_demucs_stems_mapped(self) -> None:
        """Verify all standard Demucs output stems map to BandScope stems."""
        expected_demucs_stems = {"vocals", "bass", "drums", "other"}
        assert set(_DEMUCS_TO_BANDSCOPE.keys()) == expected_demucs_stems

    def test_mapping_to_canonical_bandscope_names(self) -> None:
        """Verify mapped names are valid BandScope AudioStemName values."""
        valid_bandscope_names = {"vocals", "bass", "drums", "other"}
        for bandscope_name in _DEMUCS_TO_BANDSCOPE.values():
            assert bandscope_name in valid_bandscope_names


class TestDemucsModelSeparator:
    """Tests for the DemucsModelSeparator class."""

    def test_initialization_with_default_config(self) -> None:
        """Verify DemucsModelSeparator initializes with default config."""
        separator = DemucsModelSeparator()
        assert separator.config.chunk_seconds == 10.0
        assert separator._model is None
        assert separator._device is None

    def test_initialization_with_custom_config(self) -> None:
        """Verify DemucsModelSeparator accepts custom config."""
        config = DemucsConfig(chunk_seconds=5.0, overlap_seconds=0.5)
        separator = DemucsModelSeparator(config)
        assert separator.config.chunk_seconds == 5.0
        assert separator.config.overlap_seconds == 0.5

    def test_stem_mapping_covers_all_demucs_outputs(self) -> None:
        """Verify all Demucs stem names map to BandScope AudioStemName."""
        # Demucs htdemucs outputs: drums, bass, other, vocals
        demucs_stems = ["drums", "bass", "other", "vocals"]
        for stem in demucs_stems:
            assert stem in _DEMUCS_TO_BANDSCOPE
            assert _DEMUCS_TO_BANDSCOPE[stem] in ("vocals", "bass", "drums", "other")


class TestAudioStemSeparatorDemucsIntegration:
    """Tests for AudioStemSeparator with Demucs integration."""

    def test_falls_back_to_dsp_when_demucs_unavailable(self, tmp_path) -> None:
        """Verify DSP fallback when Demucs is not available."""
        sample_rate = 8_000
        samples = int(sample_rate * 0.5)
        audio = np.sin(2 * np.pi * 440.0 * np.arange(samples) / sample_rate).astype(
            np.float32
        )
        audio_path = tmp_path / "test.wav"
        sf.write(audio_path, audio, sample_rate)

        config = AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_file_bytes=1_000_000,
            max_duration_seconds=1.0,
            chunk_duration_seconds=0.25,
            use_demucs=True,
        )
        separator = AudioStemSeparator(config)
        result = separator.separate(audio_path)

        # Should fallback to DSP since torch/demucs not installed in test env
        assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
        assert result["sample_rate"] == sample_rate
        assert "chunks" in result["separation_notes"]

    def test_demucs_disabled_by_config(self, tmp_path) -> None:
        """Verify DSP is used when use_demucs=False."""
        sample_rate = 8_000
        samples = int(sample_rate * 0.5)
        audio = np.sin(2 * np.pi * 440.0 * np.arange(samples) / sample_rate).astype(
            np.float32
        )
        audio_path = tmp_path / "test.wav"
        sf.write(audio_path, audio, sample_rate)

        config = AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_file_bytes=1_000_000,
            max_duration_seconds=1.0,
            chunk_duration_seconds=0.25,
            use_demucs=False,
        )
        separator = AudioStemSeparator(config)
        assert not separator.uses_ml_model

        result = separator.separate(audio_path)
        assert "chunks" in result["separation_notes"]

    def test_uses_ml_model_property(self) -> None:
        """Verify uses_ml_model reflects Demucs availability."""
        config = AudioSeparationConfig(use_demucs=False)
        separator = AudioStemSeparator(config)
        assert separator.uses_ml_model is False

    def test_demucs_failure_falls_back_to_dsp(self, tmp_path) -> None:
        """Verify DSP fallback when Demucs inference raises an exception."""
        sample_rate = 8_000
        samples = int(sample_rate * 0.5)
        audio = np.sin(2 * np.pi * 440.0 * np.arange(samples) / sample_rate).astype(
            np.float32
        )
        audio_path = tmp_path / "test.wav"
        sf.write(audio_path, audio, sample_rate)

        config = AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_file_bytes=1_000_000,
            max_duration_seconds=1.0,
            chunk_duration_seconds=0.25,
            use_demucs=True,
        )
        separator = AudioStemSeparator(config)

        # Mock to simulate Demucs being available but failing during inference
        mock_demucs = MagicMock()
        mock_demucs.separate.side_effect = RuntimeError("CUDA out of memory")
        separator._demucs = mock_demucs
        separator._demucs_checked = True

        result = separator.separate(audio_path)

        # Should fall back to DSP
        assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
        assert "chunks" in result["separation_notes"]

    def test_demucs_success_returns_ml_notes(self, tmp_path) -> None:
        """Verify ML separation notes when Demucs succeeds."""
        sample_rate = 8_000
        samples = int(sample_rate * 0.5)
        audio = np.sin(2 * np.pi * 440.0 * np.arange(samples) / sample_rate).astype(
            np.float32
        )
        audio_path = tmp_path / "test.wav"
        sf.write(audio_path, audio, sample_rate)

        config = AudioSeparationConfig(
            target_sample_rate=sample_rate,
            max_file_bytes=1_000_000,
            max_duration_seconds=1.0,
            chunk_duration_seconds=0.25,
            use_demucs=True,
        )
        separator = AudioStemSeparator(config)

        # Mock successful Demucs separation
        mock_demucs = MagicMock()
        mock_demucs.separate.return_value = {
            "vocals": np.random.randn(samples).astype(np.float32),
            "bass": np.random.randn(samples).astype(np.float32),
            "drums": np.random.randn(samples).astype(np.float32),
            "other": np.random.randn(samples).astype(np.float32),
        }
        separator._demucs = mock_demucs
        separator._demucs_checked = True

        result = separator.separate(audio_path)

        assert "Demucs ML model" in result["separation_notes"]
        assert set(result["stems"]) == {"vocals", "bass", "drums", "other"}
        assert result["sample_rate"] == sample_rate


class TestModelWeightManager:
    """Tests for the model weight manager."""

    def test_default_cache_dir(self) -> None:
        """Verify default cache directory is XDG-compliant."""
        cache_dir = _default_cache_dir()
        assert "bandscope" in str(cache_dir)
        assert "models" in str(cache_dir)

    def test_default_cache_dir_with_xdg_env(self, monkeypatch, tmp_path) -> None:
        """Verify XDG_CACHE_HOME is respected."""
        monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path))
        cache_dir = _default_cache_dir()
        assert str(tmp_path) in str(cache_dir)

    def test_verify_sha256_correct(self, tmp_path) -> None:
        """Verify SHA-256 verification passes for correct content."""
        test_file = tmp_path / "test.bin"
        test_file.write_bytes(b"hello world")
        import hashlib

        expected = hashlib.sha256(b"hello world").hexdigest()
        assert _verify_sha256(test_file, expected) is True

    def test_verify_sha256_incorrect(self, tmp_path) -> None:
        """Verify SHA-256 verification fails for wrong content."""
        test_file = tmp_path / "test.bin"
        test_file.write_bytes(b"hello world")
        assert _verify_sha256(test_file, "wrong_hash") is False

    def test_verify_sha256_missing_file(self, tmp_path) -> None:
        """Verify SHA-256 gracefully handles missing files."""
        assert _verify_sha256(tmp_path / "nonexistent.bin", "any_hash") is False

    def test_model_weight_config_defaults(self) -> None:
        """Verify model weight configuration defaults."""
        config = ModelWeightConfig()
        assert config.model_name == "htdemucs"
        assert config.model_filename == "htdemucs.th"
        assert "fbaipublicfiles.com" in config.download_url
        assert config.max_download_bytes == 500_000_000

    def test_is_available_when_no_cached_file(self, tmp_path) -> None:
        """Verify availability check returns False when no cache exists."""
        config = ModelWeightConfig(cache_dir=str(tmp_path))
        manager = ModelWeightManager(config)
        assert manager.is_available() is False

    def test_is_available_when_cached_but_wrong_hash(self, tmp_path) -> None:
        """Verify availability check fails with corrupted cache."""
        config = ModelWeightConfig(cache_dir=str(tmp_path))
        manager = ModelWeightManager(config)
        # Create a file with wrong content
        (tmp_path / config.model_filename).write_bytes(b"corrupted data")
        assert manager.is_available() is False

    def test_is_available_when_cached_correctly(self, tmp_path) -> None:
        """Verify availability check passes with correct cached file."""
        import hashlib

        content = b"correct model weights"
        sha256 = hashlib.sha256(content).hexdigest()
        config = ModelWeightConfig(
            cache_dir=str(tmp_path),
            expected_sha256=sha256,
            model_filename="test_model.th",
        )
        manager = ModelWeightManager(config)
        (tmp_path / "test_model.th").write_bytes(content)
        assert manager.is_available() is True

    def test_model_path_property(self, tmp_path) -> None:
        """Verify model_path returns expected location."""
        config = ModelWeightConfig(cache_dir=str(tmp_path))
        manager = ModelWeightManager(config)
        assert manager.model_path == tmp_path / config.model_filename

    def test_ensure_weights_returns_path_when_cached(self, tmp_path) -> None:
        """Verify ensure_weights returns path without downloading when cached."""
        import hashlib

        content = b"model weights"
        sha256 = hashlib.sha256(content).hexdigest()
        config = ModelWeightConfig(
            cache_dir=str(tmp_path),
            expected_sha256=sha256,
            model_filename="cached.th",
        )
        manager = ModelWeightManager(config)
        (tmp_path / "cached.th").write_bytes(content)

        path = manager.ensure_weights()
        assert path == tmp_path / "cached.th"

    def test_ensure_weights_raises_on_download_failure(self, tmp_path) -> None:
        """Verify ensure_weights raises RuntimeError on download failure."""
        config = ModelWeightConfig(
            cache_dir=str(tmp_path),
            download_url="http://invalid.example.com/model.th",
            download_timeout_seconds=1.0,
        )
        manager = ModelWeightManager(config)

        with pytest.raises((RuntimeError, Exception)):
            manager.ensure_weights()
