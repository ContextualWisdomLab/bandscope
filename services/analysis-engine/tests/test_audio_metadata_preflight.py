"""Bounded container-metadata preflight regressions."""

import inspect
import io
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from bandscope_analysis.audio_metadata import preflight_audio_metadata
from bandscope_analysis.audio_resource_policy import AudioResourcePolicyError


def _audio_metadata_fixture(
    *, frames: int = 44_100, samplerate: int = 44_100, channels: int = 2
) -> SimpleNamespace:
    """Build the metadata subset consumed by the preflight boundary."""
    return SimpleNamespace(frames=frames, samplerate=samplerate, channels=channels)


def test_preflight_audio_metadata_uses_semantic_public_parameter_names() -> None:
    """The organization-owned metadata port should expose bounded-context names."""
    parameter_names = tuple(inspect.signature(preflight_audio_metadata).parameters)

    assert parameter_names == ("audio_source", "audio_resource_policy")


@patch("bandscope_analysis.audio_metadata.soundfile.info")
def test_preflight_accepts_metadata_without_decoding_and_rewinds(
    mock_info: object,
) -> None:
    """Metadata validation must preserve the caller-owned handle for the decoder."""
    audio_source = io.BytesIO(b"header-bytes")

    def inspect_audio_handle(audio_handle: io.BytesIO) -> SimpleNamespace:
        audio_handle.read(3)
        return _audio_metadata_fixture()

    mock_info.side_effect = inspect_audio_handle  # type: ignore[attr-defined]

    preflight_audio_metadata(audio_source)

    assert audio_source.tell() == 0


@pytest.mark.parametrize(
    ("audio_metadata", "policy_reason"),
    [
        (_audio_metadata_fixture(frames=44_100 * 901), "duration_exceeded"),
        (_audio_metadata_fixture(channels=3), "channel_count_unsupported"),
        (_audio_metadata_fixture(samplerate=7_999), "sampling_rate_unsupported"),
        (_audio_metadata_fixture(frames=0), "duration_too_short"),
    ],
)
@patch("bandscope_analysis.audio_metadata.soundfile.info")
def test_preflight_rejects_untrusted_container_metadata(
    mock_info: object,
    audio_metadata: SimpleNamespace,
    policy_reason: str,
) -> None:
    """Source metadata must fail closed before resampling, downmixing, or truncation."""
    mock_info.return_value = audio_metadata  # type: ignore[attr-defined]

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        preflight_audio_metadata(io.BytesIO(b"header"))

    assert caught_error.value.rejection_reason == policy_reason


@patch(
    "bandscope_analysis.audio_metadata.soundfile.info",
    side_effect=RuntimeError("decoder detail"),
)
def test_preflight_maps_probe_failures_to_payload_free_policy_error(_mock_info: object) -> None:
    """Container parser failures must not leak decoder detail or bypass policy errors."""
    with pytest.raises(AudioResourcePolicyError) as caught_error:
        preflight_audio_metadata(io.BytesIO(b"bad-header"))

    assert caught_error.value.rejection_reason == "malformed_header"
    assert "decoder detail" not in caught_error.value.safe_message


@patch("bandscope_analysis.audio_metadata.soundfile.info")
def test_preflight_maps_rewind_failures_to_payload_free_policy_error(mock_info: object) -> None:
    """A handle that cannot rewind after probing must not reach a decoder."""

    class SeekFailsAfterProbe(io.BytesIO):
        """Fail only when the metadata boundary tries to rewind the handle."""

        def __init__(self) -> None:
            """Initialize the caller-owned byte handle and seek counter."""
            super().__init__(b"header")
            self.seek_count = 0

        def seek(self, *args: object, **kwargs: object) -> int:
            """Reject the second seek, which is the post-probe rewind."""
            self.seek_count += 1
            if self.seek_count == 2:
                raise OSError("rewind failed")
            return super().seek(*args, **kwargs)

    mock_info.return_value = _audio_metadata_fixture()  # type: ignore[attr-defined]

    with pytest.raises(AudioResourcePolicyError) as caught_error:
        preflight_audio_metadata(SeekFailsAfterProbe())

    assert caught_error.value.rejection_reason == "malformed_header"
    assert "rewind failed" not in caught_error.value.safe_message


def test_path_preflight_uses_local_decoder_metadata_for_compressed_containers(
    tmp_path,
) -> None:
    """Path-backed M4A metadata should use the existing local decoder fallback."""
    audio_source = tmp_path / "rehearsal.m4a"
    audio_source.write_bytes(b"container")
    decoder_descriptor = SimpleNamespace(duration=1.0, samplerate=44_100, channels=2)

    with (
        patch(
            "bandscope_analysis.audio_metadata.soundfile.info",
            side_effect=RuntimeError("container unsupported by libsndfile"),
        ),
        patch("bandscope_analysis.audio_metadata.audioread.audio_open") as audio_open,
    ):
        audio_open.return_value.__enter__.return_value = decoder_descriptor
        preflight_audio_metadata(audio_source)

    audio_open.assert_called_once_with(str(audio_source))


def test_path_preflight_rejects_when_compressed_metadata_fallback_fails(tmp_path) -> None:
    """Unavailable compressed-container metadata must fail closed without decoder detail."""
    audio_source = tmp_path / "unreadable.m4a"
    audio_source.write_bytes(b"container")

    with (
        patch(
            "bandscope_analysis.audio_metadata.soundfile.info",
            side_effect=RuntimeError("container unsupported by libsndfile"),
        ),
        patch(
            "bandscope_analysis.audio_metadata.audioread.audio_open",
            side_effect=RuntimeError("decoder detail"),
        ),
    ):
        with pytest.raises(AudioResourcePolicyError) as caught_error:
            preflight_audio_metadata(audio_source)

    assert caught_error.value.rejection_reason == "malformed_header"
    assert "decoder detail" not in caught_error.value.safe_message


def test_path_preflight_uses_libsndfile_metadata_when_available(tmp_path) -> None:
    """Supported path containers should retain the bounded libsndfile probe."""
    audio_source = tmp_path / "rehearsal.wav"
    audio_source.write_bytes(b"container")

    with (
        patch(
            "bandscope_analysis.audio_metadata.soundfile.info",
            return_value=_audio_metadata_fixture(),
        ) as soundfile_info,
        patch("bandscope_analysis.audio_metadata.audioread.audio_open") as audio_open,
    ):
        preflight_audio_metadata(audio_source)

    soundfile_info.assert_called_once_with(audio_source)
    audio_open.assert_not_called()


def test_path_preflight_preserves_policy_errors_from_decoder_metadata(tmp_path) -> None:
    """Compressed metadata that violates policy must keep its stable reason code."""
    audio_source = tmp_path / "surround.m4a"
    audio_source.write_bytes(b"container")
    decoder_descriptor = SimpleNamespace(duration=1.0, samplerate=44_100, channels=3)

    with (
        patch(
            "bandscope_analysis.audio_metadata.soundfile.info",
            side_effect=RuntimeError("container unsupported by libsndfile"),
        ),
        patch("bandscope_analysis.audio_metadata.audioread.audio_open") as audio_open,
    ):
        audio_open.return_value.__enter__.return_value = decoder_descriptor
        with pytest.raises(AudioResourcePolicyError) as caught_error:
            preflight_audio_metadata(audio_source)

    assert caught_error.value.rejection_reason == "channel_count_unsupported"
