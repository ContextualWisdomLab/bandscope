"""Regression tests for the YouTube output-directory guard."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from bandscope_analysis.youtube import (
    OUTPUT_DIRECTORY_INVALID_MESSAGE,
    _contains_parent_path_segment,
    _path_is_within_directory,
    _resolve_output_directory,
    download_youtube_audio,
)

YOUTUBE_URL = "https://youtube.com/watch?v=abc123DEF45"


@pytest.mark.parametrize("separator", ["/", "\\"])
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_parent_segment(
    mock_ydl_class: MagicMock,
    separator: str,
) -> None:
    """Reject a parent segment regardless of the platform separator."""
    parent = "." * 2
    out_dir = separator.join(("safe", parent, "outside"))

    result = download_youtube_audio(YOUTUBE_URL, out_dir)

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
        YOUTUBE_URL,
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


@pytest.mark.parametrize(
    ("out_dir", "allowed_output_root"),
    [
        ("", None),
        (r"C:media", None),
        ("media", ""),
        ("media", "safe/../root"),
        ("media", "relative-root"),
    ],
)
def test_output_directory_rejects_invalid_path_contracts(
    out_dir: str,
    allowed_output_root: str | None,
) -> None:
    """Reject empty, drive-relative, traversing, and relative-root path contracts."""
    assert _resolve_output_directory(out_dir, allowed_output_root) is None


def test_output_directory_rejects_resolution_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fail closed when canonical path resolution cannot be completed."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()
    allowed_root_value = str(allowed_root)

    def fail_resolution(_path: Path, *, strict: bool = False) -> Path:
        del strict
        raise OSError("resolution unavailable")

    monkeypatch.setattr(Path, "resolve", fail_resolution)

    assert _resolve_output_directory("media", allowed_root_value) is None


def test_output_directory_rejects_non_directory_root(tmp_path: Path) -> None:
    """Require the allowlisted output root to be an existing directory."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.write_text("not a directory", encoding="utf-8")

    assert _resolve_output_directory("media", str(allowed_root)) is None


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


def test_path_guard_rejects_resolved_path_outside_directory(tmp_path: Path) -> None:
    """Reject downloader paths that canonicalize outside the resolved directory."""
    allowed_directory = tmp_path / "allowed-root"
    allowed_directory.mkdir()

    assert _path_is_within_directory(str(tmp_path / "outside.webm"), allowed_directory) is False


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_prepared_filename_escape(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """Reject a downloader-prepared filename outside the resolved output directory."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.prepare_filename.return_value = str(tmp_path / "outside.webm")

    result = download_youtube_audio(
        YOUTUBE_URL,
        "media",
        allowed_output_root=str(allowed_root),
    )

    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": OUTPUT_DIRECTORY_INVALID_MESSAGE,
        },
    }


@patch("bandscope_analysis.youtube._find_downloaded_file")
@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_discovered_file_escape(
    mock_ydl_class: MagicMock,
    mock_find_downloaded_file: MagicMock,
    tmp_path: Path,
) -> None:
    """Reject a postprocessed file that resolves outside the output directory."""
    allowed_root = tmp_path / "allowed-root"
    allowed_root.mkdir()
    output_directory = allowed_root / "media"
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "id": "abc123DEF45",
        "title": "Test Video",
        "duration": 60,
    }
    mock_ydl.prepare_filename.return_value = str(output_directory / "abc123DEF45.webm")
    mock_find_downloaded_file.return_value = str(tmp_path / "outside.opus")

    result = download_youtube_audio(
        YOUTUBE_URL,
        "media",
        allowed_output_root=str(allowed_root),
    )

    assert result == {
        "ok": False,
        "error": {
            "code": "invalid_output_directory",
            "message": OUTPUT_DIRECTORY_INVALID_MESSAGE,
        },
    }


def test_output_guard_allows_literal_double_dots_inside_name() -> None:
    """Keep ordinary names containing two dots when they are not a parent segment."""
    assert _contains_parent_path_segment("safe/my..cache") is False
