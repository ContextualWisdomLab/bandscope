"""Bounded container-metadata preflight regressions."""

import io
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from bandscope_analysis.audio_metadata import preflight_audio_metadata
from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError


def _info(*, frames: int = 44_100, samplerate: int = 44_100, channels: int = 2) -> SimpleNamespace:
    """Build the metadata subset consumed by the preflight boundary."""
    return SimpleNamespace(frames=frames, samplerate=samplerate, channels=channels)


@patch("bandscope_analysis.audio_metadata.soundfile.info")
def test_preflight_accepts_metadata_without_decoding_and_rewinds(
    mock_info: object,
) -> None:
    """Metadata validation must preserve the caller-owned handle for the decoder."""
    source = io.BytesIO(b"header-bytes")

    def inspect(handle: io.BytesIO) -> SimpleNamespace:
        handle.read(3)
        return _info()

    mock_info.side_effect = inspect  # type: ignore[attr-defined]

    preflight_audio_metadata(source)

    assert source.tell() == 0


@pytest.mark.parametrize(
    ("info", "reason"),
    [
        (_info(frames=44_100 * 901), "duration_exceeded"),
        (_info(channels=3), "channel_count_unsupported"),
        (_info(samplerate=7_999), "sampling_rate_unsupported"),
        (_info(frames=0), "duration_too_short"),
    ],
)
@patch("bandscope_analysis.audio_metadata.soundfile.info")
def test_preflight_rejects_untrusted_container_metadata(
    mock_info: object,
    info: SimpleNamespace,
    reason: str,
) -> None:
    """Source metadata must fail closed before resampling, downmixing, or truncation."""
    mock_info.return_value = info  # type: ignore[attr-defined]

    with pytest.raises(AudioResourcePolicyError) as error:
        preflight_audio_metadata(io.BytesIO(b"header"))

    assert error.value.reason == reason


@patch("bandscope_analysis.audio_metadata.soundfile.info", side_effect=RuntimeError("decoder detail"))
def test_preflight_maps_probe_failures_to_payload_free_policy_error(_mock_info: object) -> None:
    """Container parser failures must not leak decoder detail or bypass policy errors."""
    with pytest.raises(AudioResourcePolicyError) as error:
        preflight_audio_metadata(io.BytesIO(b"bad-header"))

    assert error.value.reason == "malformed_header"
    assert "decoder detail" not in error.value.message
