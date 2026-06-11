"""Tests for audio stem separation."""

import sys
from types import ModuleType, SimpleNamespace
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


@pytest.fixture
def fake_demucs_modules(
    monkeypatch: pytest.MonkeyPatch, mock_demucs_model: mock.MagicMock
) -> SimpleNamespace:
    """Provide fake Demucs modules without importing torchaudio-backed packages."""
    import torch

    def fake_convert(wav, from_sr, to_sr, channels):
        return torch.zeros((2, 100))

    demucs_module = ModuleType("demucs")
    demucs_module.__path__ = []
    apply_module = ModuleType("demucs.apply")
    audio_module = ModuleType("demucs.audio")
    states_module = ModuleType("demucs.states")

    apply_model = mock.MagicMock(return_value=torch.ones((1, 4, 2, 100)))
    convert_audio = mock.MagicMock(side_effect=fake_convert)
    load_model = mock.MagicMock(return_value=mock_demucs_model)

    apply_module.apply_model = apply_model
    audio_module.convert_audio = convert_audio
    states_module.load_model = load_model
    monkeypatch.setitem(sys.modules, "demucs", demucs_module)
    monkeypatch.setitem(sys.modules, "demucs.apply", apply_module)
    monkeypatch.setitem(sys.modules, "demucs.audio", audio_module)
    monkeypatch.setitem(sys.modules, "demucs.states", states_module)

    return SimpleNamespace(
        apply_model=apply_model,
        convert_audio=convert_audio,
        load_model=load_model,
    )


@mock.patch("bandscope_analysis.separation.audio_separator.logger")
@mock.patch("pathlib.Path.exists", return_value=True)
@mock.patch("hashlib.sha256")
def test_audio_stem_separator(
    mock_sha256,
    mock_exists,
    mock_logger,
    fake_demucs_modules,
):
    """Test that the AudioStemSeparator correctly coordinates the mock Demucs model."""
    mock_hash = mock.MagicMock()
    mock_hash.hexdigest.return_value = "f7e0c4bc_fake_hash"
    mock_sha256.return_value = mock_hash

    separator = AudioStemSeparator(model_name="fake_model")

    # Test mono audio
    with mock.patch("builtins.open", mock.mock_open(read_data=b"fake model")):
        audio_data = np.zeros((100,))
        result = separator.separate_audio(audio_data, sample_rate=22050, segment_seconds=2.0)

    # Assertions
    fake_demucs_modules.load_model.assert_called_once()
    fake_demucs_modules.apply_model.assert_called_once()
    kwargs = fake_demucs_modules.apply_model.call_args.kwargs
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
    assert fake_demucs_modules.load_model.call_count == 1
    assert fake_demucs_modules.apply_model.call_count == 2


@mock.patch("pathlib.Path.exists", return_value=False)
def test_audio_stem_separator_requires_preprovisioned_model(
    mock_exists,
    fake_demucs_modules,
) -> None:
    """Reject stem separation when model weights are not present locally."""
    separator = AudioStemSeparator(model_name="fake_model")

    with pytest.raises(RuntimeError, match="Pre-provisioned model fake_model not found"):
        separator._load_model()


@mock.patch("pathlib.Path.exists", return_value=True)
@mock.patch("hashlib.sha256")
def test_audio_stem_separator_rejects_checksum_mismatch(
    mock_sha256,
    mock_exists,
    fake_demucs_modules,
) -> None:
    """Reject model weights when the local artifact checksum does not match."""
    mock_hash = mock.MagicMock()
    mock_hash.hexdigest.return_value = "badc0ffee_fake_hash"
    mock_sha256.return_value = mock_hash
    separator = AudioStemSeparator(model_name="fake_model")

    with mock.patch("builtins.open", mock.mock_open(read_data=b"fake model")):
        with pytest.raises(RuntimeError, match="Model checksum mismatch"):
            separator._load_model()


@mock.patch("bandscope_analysis.separation.audio_separator.logger")
@mock.patch("pathlib.Path.exists", return_value=True)
@mock.patch("hashlib.sha256")
@mock.patch("torch.from_numpy")
@mock.patch("torch.cuda.is_available")
@mock.patch("torch.backends.mps.is_available")
def test_audio_stem_separator_device(
    mock_mps,
    mock_cuda,
    mock_from_numpy,
    mock_sha256,
    mock_exists,
    mock_logger,
    fake_demucs_modules,
):
    """Test that device selection (mps, cuda, cpu) falls back correctly."""
    # This test verifies that the correct device string is chosen.
    # By mocking torch.from_numpy and convert_audio, we prevent real tensors
    # from being created, thus avoiding actual PyTorch .to("cuda") calls
    # that would fail on machines compiled without CUDA.
    mock_hash = mock.MagicMock()
    mock_hash.hexdigest.return_value = "f7e0c4bc_fake_hash"
    mock_sha256.return_value = mock_hash

    mock_tensor = mock.MagicMock()
    mock_from_numpy.return_value.float.return_value = mock_tensor
    fake_demucs_modules.convert_audio.side_effect = None
    fake_demucs_modules.convert_audio.return_value = mock_tensor
    mock_tensor.unsqueeze.return_value = mock_tensor
    mock_tensor.to.return_value = mock_tensor

    # Mock apply_model return value so stems[0].cpu().numpy() works
    mock_stems_item = mock.MagicMock()
    mock_stems_item.cpu.return_value.numpy.return_value = np.zeros((4, 2, 100))
    mock_stems = mock.MagicMock()
    mock_stems.__getitem__.return_value = mock_stems_item
    fake_demucs_modules.apply_model.return_value = mock_stems

    separator = AudioStemSeparator(model_name="fake_model")
    audio_data = np.zeros((2, 100))  # Test stereo

    # 1. Test cuda
    mock_cuda.return_value = True
    mock_mps.return_value = False
    with mock.patch("builtins.open", mock.mock_open(read_data=b"fake model")):
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
