"""Focused YouTube resource-policy reason-code regressions."""

from unittest.mock import MagicMock, patch

from bandscope_analysis.youtube import download_youtube_audio

YOUTUBE_URL = "https://youtube.com/watch?v=abc123DEF45"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_zero_duration_metadata_fails_before_download(mock_ydl_class: MagicMock) -> None:
    """A zero-duration video must retain the canonical duration-too-short reason."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 0}

    result = download_youtube_audio(YOUTUBE_URL, "/tmp")

    assert result == {
        "ok": False,
        "error": {
            "code": "duration_too_short",
            "message": "Choose a longer song file to start analysis.",
        },
    }
    mock_ydl.extract_info.assert_called_once_with(YOUTUBE_URL, download=False)


@patch("bandscope_analysis.youtube.os.path.getsize", return_value=0)
@patch("bandscope_analysis.youtube.os.path.exists", return_value=True)
@patch("bandscope_analysis.youtube.os.remove")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_zero_byte_download_retains_malformed_header_reason(
    mock_ydl_class: MagicMock,
    mock_remove: MagicMock,
    _mock_exists: MagicMock,
    _mock_getsize: MagicMock,
) -> None:
    """An empty downloaded artifact must not be mislabeled as merely oversized."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 60}
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.m4a"

    result = download_youtube_audio(YOUTUBE_URL, "/tmp")

    assert result == {
        "ok": False,
        "error": {
            "code": "malformed_header",
            "message": "Choose another song file. This one could not be read as audio.",
        },
    }
    mock_remove.assert_called_once_with("/tmp/abc123DEF45.m4a")
