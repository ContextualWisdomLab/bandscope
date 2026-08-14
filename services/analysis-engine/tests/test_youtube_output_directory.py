"""Regression tests for the YouTube output-directory guard."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from bandscope_analysis.youtube import (
    OUTPUT_DIRECTORY_INVALID_MESSAGE,
    _contains_parent_path_segment,
    _resolve_output_directory,
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


@pytest.mark.parametrize("out_dir", ["/bandscope-outside", r"C:\bandscope-outside"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_absolute_path_outside_allowed_root(
    mock_ydl_class: MagicMock,
    out_dir: str,
    tmp_path: Path,
) -> None:
    """Reject POSIX and Windows absolute paths outside the caller-owned root."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        out_dir,
        allowed_output_root=str(allowed_root),
    )

    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": OUTPUT_DIRECTORY_INVALID_MESSAGE,
        },
    }
    mock_ydl_class.assert_not_called()


def test_output_directory_resolves_relative_child_under_allowed_root(tmp_path: Path) -> None:
    """Resolve a relative child beneath the explicit root without escaping it."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()

    resolved = _resolve_output_directory("media", str(allowed_root))

    assert resolved == allowed_root.resolve() / "media"


def test_output_directory_rejects_direct_symlink(tmp_path: Path) -> None:
    """Reject an existing direct symlink even when its target stays in the root."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()
    target = allowed_root / "target"
    target.mkdir()
    symlink = allowed_root / "media"
    try:
        symlink.symlink_to(target, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is unavailable on this platform")

    assert _resolve_output_directory(str(symlink), str(allowed_root)) is None


def test_output_guard_allows_literal_double_dots_inside_name() -> None:
    """Keep ordinary names containing two dots when they are not a parent segment."""
    assert _contains_parent_path_segment("safe/my..cache") is False
