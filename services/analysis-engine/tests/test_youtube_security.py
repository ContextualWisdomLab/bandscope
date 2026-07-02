"""Security tests for YouTube audio extraction."""

from unittest.mock import MagicMock, patch

from bandscope_analysis.youtube import (
    download_youtube_audio,
    validate_url,
)


def test_validate_url_subdomains():
    """Test URL subdomains for YouTube."""
    assert validate_url("https://m.youtube.com/watch?v=abc123DEF45") is True
    assert validate_url("https://music.youtube.com/watch?v=abc123DEF45") is True


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.os.path.abspath")
def test_directory_traversal_blocked(mock_abspath, mock_exists, mock_ydl_class):
    """Test directory traversal."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45"}
    mock_ydl.process_ie_result.return_value = {"id": "abc123DEF45"}

    mock_ydl.prepare_filename.return_value = "/etc/passwd"
    mock_exists.return_value = True

    def side_effect(p):
        if p == "/etc/passwd":
            return "/etc/passwd"
        if p == "/tmp":
            return "/tmp"
        return p

    mock_abspath.side_effect = side_effect

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")
    assert result["ok"] is False
    assert result["error"]["code"] == "file_not_found"
