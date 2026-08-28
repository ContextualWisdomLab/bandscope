"""Focused stem-separation resource-policy regressions."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError
from bandscope_analysis.separation.audio_separator import AudioStemSeparator


@patch("bandscope_analysis.separation.audio_separator.librosa.load")
def test_separator_rejects_non_finite_decoder_output_before_normalization(
    mock_load: MagicMock,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NaN/Inf decoder output must fail closed instead of becoming silent zeros."""
    audio_path = tmp_path / "rehearsal.wav"
    audio_path.write_bytes(b"RIFF")
    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.preflight_audio_metadata",
        lambda _fileobj: None,
    )
    mock_load.return_value = (np.array([0.0, np.nan], dtype=np.float32), 44_100)

    with pytest.raises(AudioResourcePolicyError) as error:
        AudioStemSeparator()._load_audio(audio_path)

    assert error.value.reason == "malformed_header"
