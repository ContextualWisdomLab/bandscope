"""Regression tests for the YouTube output-directory guard."""

from unittest.mock import MagicMock, patch

import pytest

from bandscope_analysis.youtube import (
    OUTPUT_DIRECTORY_INVALID_MESSAGE,
    _contains_parent_path_segment,
    download_youtube_audio,
)


@pytest.mark.parametrize("separator", ["/", "\\"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_parent_segment(
    mock_ydl_class: MagicMock,
    separator: str,
) -> None:
    """Reject a parent segment regardless of the platform separator."""
    parent = "." * 2
    out_dir = separator.join(("safe", parent, "outside"))

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        out_dir,
    )

    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": OUTPUT_DIRECTORY_INVALID_MESSAGE,
        },
    }
    mock_ydl_class.assert_not_called()


def test_output_guard_allows_literal_double_dots_inside_name() -> None:
    """Keep ordinary names containing two dots when they are not a parent segment."""
    assert _contains_parent_path_segment("safe/my..cache") is False
