"""Tests for YouTube import capabilities."""

import sys
from unittest.mock import MagicMock, patch

import pytest
import yt_dlp  # type: ignore

from bandscope_analysis.youtube import download_youtube_audio, validate_url


def test_validate_url() -> None:
    """Test URL validation."""
    assert validate_url("https://youtube.com/watch?v=123") is True
    assert validate_url("https://youtu.be/123") is True
    assert validate_url("https://www.youtube.com/watch?v=123") is True
    assert validate_url("http://youtube.com/watch?v=123") is False
    assert validate_url("https://vimeo.com/123") is False


def test_download_youtube_audio_invalid_url() -> None:
    """Test downloading with an invalid URL."""
    result = download_youtube_audio("https://vimeo.com/123", "/tmp")
    assert result["ok"] is False
    assert result["error"]["code"] == "unsupported_url"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_success(mock_ydl_class: MagicMock) -> None:
    """Test successful download."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "123",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    mock_ydl.prepare_filename.return_value = "/tmp/123.m4a"

    result = download_youtube_audio("https://youtube.com/watch?v=123", "/tmp")

    assert result["ok"] is True
    assert result["metadata"]["id"] == "123"
    assert result["metadata"]["title"] == "Test Video"
    assert result["metadata"]["duration"] == 60
    assert result["metadata"]["filepath"] == "/tmp/123.m4a"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_info_none(mock_ydl_class: MagicMock) -> None:
    """Test when extract_info returns None."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.return_value = None

    result = download_youtube_audio("https://youtube.com/watch?v=123", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert "Failed to extract info" in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_restricted(mock_ydl_class: MagicMock) -> None:
    """Test when download fails due to restrictions."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError("Sign in to confirm")

    result = download_youtube_audio("https://youtube.com/watch?v=123", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "restricted_content"
    assert "restricted" in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_generic_download_error(mock_ydl_class: MagicMock) -> None:
    """Test when download fails with a generic error."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError("Some random network error")

    result = download_youtube_audio("https://youtube.com/watch?v=123", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_failed"
    assert "random network error" in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_exception(mock_ydl_class: MagicMock) -> None:
    """Test when an unexpected exception occurs."""
    mock_ydl_class.side_effect = ValueError("Unexpected explosion")

    result = download_youtube_audio("https://youtube.com/watch?v=123", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert "Unexpected explosion" in result["error"]["message"]


def test_main_block(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """Test the CLI entry point."""
    test_args = ["youtube.py", "--url", "https://youtube.com/watch?v=123", "--out-dir", "/tmp"]
    monkeypatch.setattr(sys, "argv", test_args)

    with patch("bandscope_analysis.youtube.download_youtube_audio") as mock_download:
        mock_download.return_value = {"ok": True, "metadata": {"id": "123"}}

        with patch.object(sys, "exit") as mock_exit:
            import bandscope_analysis.youtube

            bandscope_analysis.youtube.main()

            mock_exit.assert_called_with(0)

            # test failure exit 1
            mock_download.return_value = {"ok": False}
            bandscope_analysis.youtube.main()
            mock_exit.assert_called_with(1)


def test_module_execution(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """Test the if __name__ == '__main__' block using runpy."""
    import runpy

    import bandscope_analysis.youtube

    test_args = ["youtube.py", "--url", "https://youtube.com/watch?v=123", "--out-dir", "/tmp"]
    monkeypatch.setattr(sys, "argv", test_args)

    # Mock yt_dlp so runpy doesn't actually download
    mock_yt_dlp = MagicMock()
    mock_ydl = MagicMock()
    mock_yt_dlp.YoutubeDL.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "123"}
    mock_ydl.prepare_filename.return_value = "/tmp/123.m4a"
    monkeypatch.setitem(sys.modules, "yt_dlp", mock_yt_dlp)

    with patch.object(sys, "exit") as mock_exit:
        runpy.run_path(bandscope_analysis.youtube.__file__, run_name="__main__")
        mock_exit.assert_called_with(0)
