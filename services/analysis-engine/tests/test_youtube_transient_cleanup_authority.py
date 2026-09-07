"""Regression coverage for lease-bound YouTube transient cleanup authority."""

from pathlib import Path

from bandscope_analysis.youtube import _remove_download_artifacts


def test_transient_cleanup_preserves_same_id_nontransient_decoy(tmp_path: Path) -> None:
    """An active video lease must not turn every same-ID filename into cleanup authority."""
    out_dir = tmp_path / "import-cache"
    out_dir.mkdir()
    video_id = "abc123DEF45"
    partial = out_dir / f"{video_id}.m4a.part"
    fragment = out_dir / f"{video_id}.m4a-Frag1"
    control = out_dir / f"{video_id}.m4a.ytdl"
    decoy = out_dir / f"{video_id}.keep.m4a"
    partial.write_bytes(b"partial")
    fragment.write_bytes(b"fragment")
    control.write_bytes(b"control")
    decoy.write_bytes(b"foreign-same-id-file")

    _remove_download_artifacts(
        {
            "tmpfilename": str(partial),
            "filename": str(decoy),
        },
        str(out_dir),
        video_id,
    )

    assert not partial.exists()
    assert not fragment.exists()
    assert not control.exists()
    assert decoy.read_bytes() == b"foreign-same-id-file"
