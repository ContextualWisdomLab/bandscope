"""Regression coverage for post-download YouTube resource-admission reasons."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

from bandscope_analysis.youtube import download_youtube_audio


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_zero_byte_download_is_malformed_not_oversize(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """Delete an empty artifact without telling the buyer it exceeded 100 MiB."""
    out_dir = tmp_path / "youtube-import"
    out_dir.mkdir()
    downloaded = out_dir / "abc123DEF45.m4a"
    downloaded.write_bytes(b"")

    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "id": "abc123DEF45",
        "title": "Empty postprocessor output",
        "duration": 60,
    }
    mock_ydl.prepare_filename.return_value = str(downloaded)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(out_dir),
    )

    assert result["ok"] is False
    assert result["error"] == {
        "code": "download_error",
        "message": "YouTube import failed. Please use a local audio file instead.",
    }
    assert not downloaded.exists()
