"""Regression coverage for post-download YouTube path authority.

The downloader owns only artifacts that resolve beneath the per-import output
directory and belong to its active same-video lease. Metadata returned by yt-dlp
must not turn an arbitrary or pre-existing filesystem path into a successful
import or deletion target.
"""

from pathlib import Path
from unittest.mock import MagicMock, patch

from bandscope_analysis.audio_resource_policy import DEFAULT_MAX_ENCODED_FILE_BYTES
from bandscope_analysis.youtube import (
    YOUTUBE_IMPORT_FAILED_MESSAGE,
    _import_lease_path,
    download_youtube_audio,
)


def _configure_download(mock_ydl_class: MagicMock, filepath: Path) -> None:
    """Configure yt-dlp to report one completed download at ``filepath``."""
    mock_ydl = MagicMock()
    mock_ydl_class.return_value.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "id": "abc123DEF45",
        "title": "Authority regression",
        "duration": 60,
    }
    mock_ydl.prepare_filename.return_value = str(filepath)


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_download_rejects_foreign_completed_path(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """A completed path outside this import directory must never become success metadata."""
    out_dir = tmp_path / "import-cache"
    out_dir.mkdir()
    foreign = tmp_path / "foreign.m4a"
    foreign.write_bytes(b"not-owned-by-this-import")
    _configure_download(mock_ydl_class, foreign)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(out_dir),
    )

    assert result == {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }
    assert foreign.read_bytes() == b"not-owned-by-this-import"


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_oversize_foreign_completed_path_is_not_deleted(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """Oversize rejection must not delete a path outside this import's authority."""
    out_dir = tmp_path / "import-cache"
    out_dir.mkdir()
    foreign = tmp_path / "foreign-oversize.m4a"
    with foreign.open("wb") as handle:
        handle.truncate(DEFAULT_MAX_ENCODED_FILE_BYTES + 1)
    _configure_download(mock_ydl_class, foreign)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(out_dir),
    )

    assert result == {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }
    assert foreign.exists()
    assert foreign.stat().st_size == DEFAULT_MAX_ENCODED_FILE_BYTES + 1


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_same_video_active_lease_blocks_second_import_without_deleting_owner_artifact(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """A rejecting same-ID import cannot enter another import's cleanup authority."""
    out_dir = tmp_path / "shared-import-cache"
    out_dir.mkdir()
    video_id = "abc123DEF45"
    first_import_artifact = out_dir / f"{video_id}.m4a"
    first_import_artifact.write_bytes(b"first-import-owned-audio")
    Path(_import_lease_path(str(out_dir), video_id)).mkdir()

    result = download_youtube_audio(
        f"https://youtube.com/watch?v={video_id}",
        str(out_dir),
    )

    assert result == {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }
    assert first_import_artifact.read_bytes() == b"first-import-owned-audio"
    mock_ydl_class.assert_not_called()


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_preexisting_same_video_artifact_is_never_overwritten_or_claimed(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """An older same-ID final artifact is not ownership evidence for a new import."""
    out_dir = tmp_path / "shared-import-cache"
    out_dir.mkdir()
    existing = out_dir / "abc123DEF45.m4a"
    existing.write_bytes(b"previous-import-audio")

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(out_dir),
    )

    assert result == {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }
    assert existing.read_bytes() == b"previous-import-audio"
    mock_ydl_class.assert_not_called()


@patch("bandscope_analysis.youtube.yt_dlp.YoutubeDL")
def test_same_video_prefixed_noncanonical_file_is_not_claimed_as_completed_artifact(
    mock_ydl_class: MagicMock,
    tmp_path: Path,
) -> None:
    """A same-ID prefix alone must not authorize a noncanonical completed filename."""
    out_dir = tmp_path / "shared-import-cache"
    out_dir.mkdir()
    decoy = out_dir / "abc123DEF45.keep.m4a"
    decoy.write_bytes(b"preexisting-noncanonical-audio")
    _configure_download(mock_ydl_class, decoy)

    result = download_youtube_audio(
        "https://youtube.com/watch?v=abc123DEF45",
        str(out_dir),
    )

    assert result == {
        "ok": False,
        "error": {"code": "download_error", "message": YOUTUBE_IMPORT_FAILED_MESSAGE},
    }
    assert decoy.read_bytes() == b"preexisting-noncanonical-audio"
