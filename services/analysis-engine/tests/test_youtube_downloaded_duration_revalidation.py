"""Post-download YouTube duration revalidation regressions."""

from unittest.mock import MagicMock, patch

from bandscope_analysis.youtube import download_youtube_audio


@patch("bandscope_analysis.youtube.os.path.getsize")
@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.os.remove")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_youtube_revalidates_downloaded_duration_before_returning_success(
    mock_ydl_class: MagicMock,
    mock_remove: MagicMock,
    mock_exists: MagicMock,
    mock_getsize: MagicMock,
) -> None:
    """Changed download metadata must not bypass the 15-minute admission limit."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.side_effect = [
        {"id": "abc123DEF45", "duration": 60},
        {"id": "abc123DEF45", "title": "Changed metadata", "duration": 16 * 60},
    ]
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.m4a"
    mock_exists.return_value = True
    mock_getsize.return_value = 10 * 1024 * 1024

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result == {
        "ok": False,
        "error": {
            "code": "duration_exceeded",
            "message": "Video exceeds the 15-minute limit.",
        },
    }
    mock_remove.assert_called_once_with("/tmp/abc123DEF45.m4a")
