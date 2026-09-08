"""Regression coverage for yt-dlp fragment cleanup with valid ID-like tokens."""

from pathlib import Path

from bandscope_analysis.youtube import _cleanup_stem, _remove_download_artifacts

VIDEO_ID_WITH_FRAGMENT_TOKEN = "abc-Frag123"


def test_cleanup_stem_preserves_fragment_token_inside_valid_video_id() -> None:
    """Only a terminal yt-dlp fragment suffix may be removed from the filename."""
    assert len(VIDEO_ID_WITH_FRAGMENT_TOKEN) == 11
    assert (
        _cleanup_stem(f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part")
        == f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a"
    )
    assert (
        _cleanup_stem(f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part-Frag2")
        == f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a"
    )


def test_cleanup_stem_requires_ascii_fragment_number() -> None:
    """Unicode digits must not widen yt-dlp's ASCII ``-FragN`` cleanup syntax."""
    unicode_digit_name = f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part-Frag２"

    assert _cleanup_stem(unicode_digit_name) == unicode_digit_name


def test_abort_cleanup_removes_fragment_when_video_id_contains_fragment_token(
    tmp_path: Path,
) -> None:
    """A valid video ID containing '-Frag' must not strand its real fragment files."""
    out_dir = tmp_path / "import-cache"
    out_dir.mkdir()
    partial = out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part"
    fragment = out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part-Frag2"
    keep = out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.keep.m4a"
    partial.write_bytes(b"partial")
    fragment.write_bytes(b"fragment")
    keep.write_bytes(b"preserve")

    _remove_download_artifacts(
        {
            "tmpfilename": str(partial),
            "filename": str(out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a"),
        },
        str(out_dir),
        VIDEO_ID_WITH_FRAGMENT_TOKEN,
    )

    assert not partial.exists()
    assert not fragment.exists()
    assert keep.exists()


def test_abort_cleanup_preserves_unicode_digit_fragment_decoy(tmp_path: Path) -> None:
    """Cleanup must not delete same-ID files outside yt-dlp's ASCII fragment grammar."""
    out_dir = tmp_path / "import-cache"
    out_dir.mkdir()
    partial = out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part"
    unicode_digit_decoy = out_dir / f"{VIDEO_ID_WITH_FRAGMENT_TOKEN}.m4a.part-Frag２"
    partial.write_bytes(b"partial")
    unicode_digit_decoy.write_bytes(b"preserve")

    _remove_download_artifacts(
        {"tmpfilename": str(partial)},
        str(out_dir),
        VIDEO_ID_WITH_FRAGMENT_TOKEN,
    )

    assert not partial.exists()
    assert unicode_digit_decoy.exists()
