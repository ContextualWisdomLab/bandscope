"""Tests for audio stem separation."""

from unittest import mock

import numpy as np
import pytest

from bandscope_analysis.separation.audio_separator import AudioStemSeparator


@pytest.fixture
def mock_demucs_model():
    """Provide a mock demucs model with standard sources."""
    mock_model = mock.MagicMock()
    mock_model.sources = ["drums", "bass", "other", "vocals"]
    mock_model.samplerate = 44100
    mock_model.audio_channels = 2
    return mock_model


@mock.patch("bandscope_analysis.separation.audio_separator.logger")
@mock.patch("demucs.audio.convert_audio")
@mock.patch("demucs.apply.apply_model")
@mock.patch("demucs.states.load_model")
@mock.patch("pathlib.Path.exists", return_value=True)
@mock.patch("hashlib.sha256")
@mock.patch("builtins.open", new_callable=mock.mock_open)
def test_audio_stem_separator(
    mock_open_file,
    mock_sha256,
    mock_exists,
    mock_load_model,
    mock_apply_model,
    mock_convert_audio,
    mock_logger,
    mock_demucs_model,
):
    """Test that the AudioStemSeparator correctly coordinates the mock Demucs model."""
    import torch

    # Setup mocks
    mock_hash = mock.MagicMock()
    mock_hash.hexdigest.return_value = "f7e0c4bc_fake_hash"
    mock_sha256.return_value = mock_hash
    mock_load_model.return_value = mock_demucs_model

    # fake convert_audio output (channels, samples)
    # convert_audio returns the tensor directly
    def fake_convert(wav, from_sr, to_sr, channels):
        # ensure shape matches expectations
        return torch.zeros((2, 100))

    mock_convert_audio.side_effect = fake_convert

    # fake apply_model output (batch, sources, channels, samples)
    mock_apply_model.return_value = torch.ones((1, 4, 2, 100))

    separator = AudioStemSeparator(model_name="fake_model")

    # Test mono audio
    audio_data = np.zeros((100,))
    result = separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)

    # Assertions
    mock_load_model.assert_called_once()
    mock_apply_model.assert_called_once()
    kwargs = mock_apply_model.call_args.kwargs
    assert kwargs["split"] is True
    assert kwargs["segment"] == 2.0
    assert kwargs["overlap"] == 0.25
    assert kwargs["shifts"] == 1
    assert kwargs["progress"] is False

    # Verify the results match the model sources
    assert set(result.keys()) == {"drums", "bass", "other", "vocals"}
    for stem_name in ["drums", "bass", "other", "vocals"]:
        assert result[stem_name].shape == (2, 100)
        assert np.all(result[stem_name] == 1.0)

    # Check that model gets loaded only once
    separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)
    assert mock_load_model.call_count == 1
    assert mock_apply_model.call_count == 2


@mock.patch("bandscope_analysis.separation.audio_separator.logger")
@mock.patch("demucs.audio.convert_audio")
@mock.patch("demucs.apply.apply_model")
@mock.patch("demucs.states.load_model")
@mock.patch("pathlib.Path.exists", return_value=True)
@mock.patch("hashlib.sha256")
@mock.patch("builtins.open", new_callable=mock.mock_open)
@mock.patch("torch.from_numpy")
@mock.patch("torch.cuda.is_available")
@mock.patch("torch.backends.mps.is_available")
def test_audio_stem_separator_device(
    mock_mps,
    mock_cuda,
    mock_from_numpy,
    mock_open_file,
    mock_sha256,
    mock_exists,
    mock_load_model,
    mock_apply_model,
    mock_convert_audio,
    mock_logger,
    mock_demucs_model,
):
    """Test that device selection (mps, cuda, cpu) falls back correctly."""
    # This test verifies that the correct device string is chosen.
    # By mocking torch.from_numpy and convert_audio, we prevent real tensors
    # from being created, thus avoiding actual PyTorch .to("cuda") calls
    # that would fail on machines compiled without CUDA.
    mock_hash = mock.MagicMock()
    mock_hash.hexdigest.return_value = "f7e0c4bc_fake_hash"
    mock_sha256.return_value = mock_hash
    mock_load_model.return_value = mock_demucs_model

    mock_tensor = mock.MagicMock()
    mock_from_numpy.return_value.float.return_value = mock_tensor
    mock_convert_audio.return_value = mock_tensor
    mock_tensor.unsqueeze.return_value = mock_tensor
    mock_tensor.to.return_value = mock_tensor

    # Mock apply_model return value so stems[0].cpu().numpy() works
    mock_stems_item = mock.MagicMock()
    mock_stems_item.cpu.return_value.numpy.return_value = np.zeros((4, 2, 100))
    mock_stems = mock.MagicMock()
    mock_stems.__getitem__.return_value = mock_stems_item
    mock_apply_model.return_value = mock_stems

    separator = AudioStemSeparator(model_name="fake_model")
    audio_data = np.zeros((2, 100))  # Test stereo

    # 1. Test cuda
    mock_cuda.return_value = True
    mock_mps.return_value = False
    result = separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)
    assert set(result.keys()) == {"drums", "bass", "other", "vocals"}
    mock_tensor.to.assert_called_with("cuda")

    # 2. Test mps
    mock_cuda.return_value = False
    mock_mps.return_value = True
    result = separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)
    mock_tensor.to.assert_called_with("mps")

    # 3. Test cpu
    mock_cuda.return_value = False
    mock_mps.return_value = False
    result = separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)
    mock_tensor.to.assert_called_with("cpu")
