"""Tests for YouTube import capabilities."""

import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest
import yt_dlp  # type: ignore

from bandscope_analysis.youtube import download_youtube_audio, validate_url


def test_validate_url() -> None:
    """Test URL validation."""
    assert validate_url("https://youtube.com/watch?v=abc123DEF45") is True
    assert validate_url("https://youtu.be/abc123DEF45") is True
    assert validate_url("https://www.youtube.com/watch?v=abc123DEF45") is True
    assert validate_url("https://www.youtube.com/watch?v=abc123DEF45&t=10") is True

    assert validate_url("https://m.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://music.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://evil.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://youtube.com/watch?v=123") is False
    assert validate_url("https://youtu.be/123") is False
    assert validate_url("http://youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://vimeo.com/abc123DEF45") is False
    assert validate_url("https://youtube.com/redirect?q=https://example.com") is False
    assert validate_url("https://www.youtube.com/redirect?q=https://example.com") is False
    assert validate_url("https://youtube.com/watch?v=") is False
    assert validate_url("https://youtu.be/") is False
    assert validate_url("https://youtu.be/abc123DEF45/extra") is False
    assert validate_url("https://youtube.com/watch?v=abc123DEF45&v=def456GHI78") is False
    assert validate_url("https://youtube.com/watch?v=&v=def456GHI78") is False
    assert validate_url("https://youtube.com/watch?v=abc123DEF45&v=") is False
    assert validate_url("https://youtube.com/watch?v=../../../etc/passwd") is False
    assert validate_url("https://youtu.be/../../../etc/passwd") is False


def test_validate_url_edge_cases() -> None:
    """Test URL validation edge cases and potential bypasses."""
    # IP address bypass attempts
    assert validate_url("https://127.0.0.1/watch?v=123") is False
    assert validate_url("https://[::1]/watch?v=123") is False

    # User info bypass attempts
    assert validate_url("https://youtube.com@evil.com/watch?v=123") is False
    assert validate_url("https://youtube.com@youtu.be/123") is False
    assert validate_url("https://user:pass@youtube.com/watch?v=123") is False

    # Subdomain/Suffix trickery
    assert validate_url("https://youtube.com.evil.com/watch?v=123") is False
    assert validate_url("https://evil-youtube.com/watch?v=123") is False

    # Path/Query trickery
    assert validate_url("https://evil.com/youtube.com/watch?v=123") is False
    assert validate_url("https://evil.com?youtube.com/watch?v=123") is False
    assert validate_url("https://evil.com#youtube.com/watch?v=123") is False

    # Allowlist behavior and explicit default ports
    assert validate_url("https://kr.youtube.com/watch?v=abc123DEF45") is False
    assert validate_url("https://youtube.com:443/watch?v=abc123DEF45") is True


def test_download_youtube_audio_invalid_url() -> None:
    """Test downloading with an invalid URL."""
    result = download_youtube_audio("https://vimeo.com/abc123DEF45", "/tmp")
    assert result["ok"] is False
    assert result["error"]["code"] == "unsupported_url"


@patch("bandscope_analysis.youtube.os.path.getsize")
@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_success(
    mock_ydl_class: MagicMock,
    mock_exists: MagicMock,
    mock_getsize: MagicMock,
) -> None:
    """Test successful download."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.webm"
    mock_exists.return_value = True
    mock_getsize.return_value = 10 * 1024 * 1024

    input_url = "https://youtube.com/watch?v=abc123DEF45"
    result = download_youtube_audio(input_url, "/tmp")

    assert result["ok"] is True
    assert result["metadata"]["id"] == "abc123DEF45"
    assert result["metadata"]["title"] == "Test Video"
    assert result["metadata"]["duration"] == 60
    assert result["metadata"]["filepath"] == "/tmp/abc123DEF45.webm"

    # Assert that YoutubeDL was initialized with the correct options
    mock_ydl_class.assert_called_once()
    called_opts = mock_ydl_class.call_args[0][0]
    assert called_opts["format"] == "bestaudio/best"
    assert called_opts["quiet"] is True
    assert called_opts["no_warnings"] is True
    assert called_opts["noprogress"] is True
    assert called_opts["noplaylist"] is True
    assert called_opts["geo_bypass"] is False
    assert called_opts["postprocessors"] == [{"key": "FFmpegExtractAudio"}]
    assert "%(id)s.%(ext)s" in called_opts["outtmpl"]

    # Verify extract_info was called twice correctly: once for metadata, once for download
    from unittest.mock import call

    assert mock_ydl.extract_info.call_count == 1

    assert mock_ydl.process_ie_result.call_count == 1
    mock_ydl.extract_info.assert_has_calls([call(input_url, download=False)])
    mock_ydl.process_ie_result.assert_has_calls([call(mock_info, download=True)])


@patch("bandscope_analysis.youtube.os.path.getsize")
@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_converted_extension(
    mock_ydl_class: MagicMock,
    mock_exists: MagicMock,
    mock_getsize: MagicMock,
) -> None:
    """Test successful download when the file is converted to another extension."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.webm"

    # os.path.exists returns False for .webm, but True for the converted .opus.
    def exists_side_effect(path: str) -> bool:
        """Mock exists function to simulate converted extension file presence."""
        return path == "/tmp/abc123DEF45.opus"

    mock_exists.side_effect = exists_side_effect
    mock_getsize.return_value = 10 * 1024 * 1024

    with patch("bandscope_analysis.youtube.glob.iglob") as mock_iglob:
        mock_iglob.return_value = iter(["/tmp/abc123DEF45.opus"])

        result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is True
    assert result["metadata"]["filepath"] == "/tmp/abc123DEF45.opus"
    mock_iglob.assert_called_once_with("/tmp/abc123DEF45.*")


@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_file_not_found(
    mock_ydl_class: MagicMock,
    mock_exists: MagicMock,
) -> None:
    """Test failure when the downloaded file cannot be found."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_info = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.extract_info.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.process_ie_result.return_value = mock_info
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.webm"
    mock_exists.return_value = False

    with patch("bandscope_analysis.youtube.glob.iglob") as mock_iglob:
        mock_iglob.return_value = iter(())

        result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "file_not_found"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_info_none(mock_ydl_class: MagicMock) -> None:
    """Test when extract_info returns None."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.return_value = None

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_restricted(mock_ydl_class: MagicMock) -> None:
    """Test when download fails due to restrictions."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError("Sign in to confirm")

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "restricted_content"
    assert "restricted" in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_generic_download_error(mock_ydl_class: MagicMock) -> None:
    """Test when download fails with a generic error."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    raw_error = (
        "Some random network error for https://youtube.com/watch?v=abc123DEF45"
        " with cookie=secret and /Users/test/local/path"
    )
    mock_ydl.extract_info.side_effect = yt_dlp.utils.DownloadError(raw_error)

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_failed"
    assert result["error"]["message"] == (
        "Failed to download audio from YouTube. Please use a local audio file instead."
    )
    assert raw_error not in result["error"]["message"]
    assert "cookie=secret" not in result["error"]["message"]
    assert "/Users/test/local/path" not in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_exception(mock_ydl_class: MagicMock) -> None:
    """Test when an unexpected exception occurs."""
    raw_error = "Unexpected explosion with token=secret in /Users/test/private/path"
    mock_ydl_class.side_effect = ValueError(raw_error)

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )
    assert raw_error not in result["error"]["message"]
    assert "token=secret" not in result["error"]["message"]
    assert "/Users/test/private/path" not in result["error"]["message"]


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_duration_exceeded(mock_ydl_class: MagicMock) -> None:
    """Test download fails if duration exceeds 15 minutes."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 16 * 60}

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")
    assert result["ok"] is False
    assert result["error"]["code"] == "duration_exceeded"


@patch("bandscope_analysis.youtube.os.path.getsize")
@patch("bandscope_analysis.youtube.os.path.exists")
@patch("bandscope_analysis.youtube.os.remove")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_size_exceeded(
    mock_ydl_class: MagicMock,
    mock_remove: MagicMock,
    mock_exists: MagicMock,
    mock_getsize: MagicMock,
) -> None:
    """Test download fails if size exceeds 50MB."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45", "duration": 10 * 60}
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.m4a"
    mock_exists.return_value = True
    mock_getsize.return_value = 51 * 1024 * 1024

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")
    assert result["ok"] is False
    assert result["error"]["code"] == "size_exceeded"
    mock_remove.assert_called_with("/tmp/abc123DEF45.m4a")


def test_main_block(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    """Test the CLI entry point."""
    test_args = [
        "youtube.py",
        "--url",
        "https://youtube.com/watch?v=abc123DEF45",
        "--out-dir",
        "/tmp",
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    import bandscope_analysis.youtube

    importlib.reload(bandscope_analysis.youtube)

    with patch("bandscope_analysis.youtube.download_youtube_audio") as mock_download:
        mock_download.return_value = {"ok": True, "metadata": {"id": "abc123DEF45"}}

        with patch.object(sys, "exit") as mock_exit:
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

    test_args = [
        "youtube.py",
        "--url",
        "https://youtube.com/watch?v=abc123DEF45",
        "--out-dir",
        "/tmp",
    ]
    monkeypatch.setattr(sys, "argv", test_args)

    # Mock yt_dlp so runpy doesn't actually download
    mock_yt_dlp = MagicMock()
    mock_ydl = MagicMock()
    mock_yt_dlp.YoutubeDL.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {"id": "abc123DEF45"}
    mock_ydl.process_ie_result.return_value = {"id": "abc123DEF45"}
    mock_ydl.prepare_filename.return_value = "/tmp/abc123DEF45.m4a"
    monkeypatch.setitem(sys.modules, "yt_dlp", mock_yt_dlp)

    # Mock os to ensure runpy uses our mocked filesystem methods
    mock_os = MagicMock()
    # Keep some essential attributes
    mock_os.path = MagicMock()
    mock_os.path.exists.return_value = True
    mock_os.path.getsize.return_value = 10 * 1024 * 1024
    monkeypatch.setitem(sys.modules, "os", mock_os)

    with patch.object(sys, "exit") as mock_exit:
        try:
            runpy.run_path(bandscope_analysis.youtube.__file__, run_name="__main__")
        except TypeError:
            pass
        mock_exit.assert_called_with(0)


@patch("bandscope_analysis.youtube.urllib.parse.urlparse")
def test_validate_url_exception(mock_urlparse: MagicMock) -> None:
    """Test URL validation exception handling."""
    mock_urlparse.side_effect = ValueError("Test exception")
    assert validate_url("https://youtube.com/watch?v=abc123DEF45") is False


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_youtube_audio_second_info_none(mock_ydl_class: MagicMock) -> None:
    """Test when the second extract_info returns None."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl

    # First call (download=False) returns info, second call (download=True) returns None
    mock_ydl.extract_info.return_value = {"duration": 60}
    mock_ydl.process_ie_result.return_value = None

    result = download_youtube_audio("https://youtube.com/watch?v=abc123DEF45", "/tmp")

    assert result["ok"] is False
    assert result["error"]["code"] == "download_error"
    assert result["error"]["message"] == (
        "YouTube import failed. Please use a local audio file instead."
    )
