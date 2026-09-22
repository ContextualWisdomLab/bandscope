"""Production-shaped coverage for reachable Resource Admission edge paths."""

from __future__ import annotations

import io
import json
import tempfile
import zipfile
from pathlib import Path

import numpy as np

from bandscope_analysis import feature_cache_admission, youtube
from bandscope_analysis.audio_resource_policy import AudioResourcePolicy


def _write_single_stem_metadata(arrays_path: Path) -> None:
    """Write the canonical sidecar required before archive-descriptor admission."""
    arrays_path.with_suffix(".json").write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": 44_100,
                "separation": {"duration_seconds": 8 / 44_100},
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "instrument"},
            }
        ),
        encoding="utf-8",
    )


def test_npz_preflight_rejects_invalid_npy_magic() -> None:
    """A ZIP member with the right name but no NPY header is never replay evidence."""
    policy = AudioResourcePolicy(target_sample_rate=44_100)
    with tempfile.SpooledTemporaryFile(mode="w+b") as archive_file:
        with zipfile.ZipFile(archive_file, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("stem_bass.npy", b"not-an-npy-array")
        archive_file.seek(0)

        assert feature_cache_admission._preflight_npz(archive_file, ["bass"], policy) is None


def test_npz_preflight_rejects_noncanonical_npy_version() -> None:
    """A valid NPY-v2 member cannot bypass the replay parser's v1-only contract."""
    policy = AudioResourcePolicy(target_sample_rate=44_100)
    npy_bytes = io.BytesIO()
    np.lib.format.write_array(
        npy_bytes,
        np.ones(8, dtype=np.float32),
        version=(2, 0),
        allow_pickle=False,
    )

    with tempfile.SpooledTemporaryFile(mode="w+b") as archive_file:
        with zipfile.ZipFile(archive_file, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("stem_bass.npy", npy_bytes.getvalue())
        archive_file.seek(0)

        assert feature_cache_admission._preflight_npz(archive_file, ["bass"], policy) is None


def test_archive_loader_rejects_empty_admitted_descriptor(tmp_path: Path) -> None:
    """An empty regular archive fails before snapshot or NumPy materialization."""
    arrays_path = tmp_path / "fixture.npz"
    _write_single_stem_metadata(arrays_path)
    arrays_path.write_bytes(b"")

    assert feature_cache_admission.load_bounded_stem_archive(arrays_path, ["bass"], 44_100) is None


def test_youtube_duration_absence_is_admissible_before_download() -> None:
    """Unknown announced duration remains eligible for later bounded admission."""
    assert youtube._reject_invalid_or_oversize_duration({}) is None


def test_youtube_video_owned_removal_rejects_foreign_identity(tmp_path: Path) -> None:
    """Cleanup cannot delete a contained file that belongs to another video ID."""
    foreign = tmp_path / "zzzzzzzzzzz.m4a"
    foreign.write_bytes(b"audio")

    youtube._remove_video_owned_file(str(foreign), str(tmp_path), "abcdefghijk")

    assert foreign.exists()


def test_youtube_status_uses_second_string_candidate_after_invalid_identity(tmp_path: Path) -> None:
    """A malformed first status path does not hide a valid second candidate."""
    video_id = "abcdefghijk"
    candidate = tmp_path / f"{video_id}.webm.part"

    assert (
        youtube._video_id_from_status(
            {
                "tmpfilename": str(tmp_path / "short.part"),
                "filename": str(candidate),
            }
        )
        == video_id
    )


def test_youtube_generic_cleanup_without_fragment_strips_partial_suffix() -> None:
    """Generic non-video cleanup keeps stem identity while removing only transient suffixes."""
    assert youtube._cleanup_stem("plain.part") == "plain"


def test_youtube_cleanup_preserves_same_video_nonmatching_stem(tmp_path: Path) -> None:
    """Cleanup removes matching transients without deleting another format stem."""
    video_id = "abcdefghijk"
    owned = tmp_path / f"{video_id}.webm.part"
    nonmatching_stem = tmp_path / f"{video_id}.m4a.part"
    owned.write_bytes(b"partial")
    nonmatching_stem.write_bytes(b"other-format")

    youtube._remove_download_artifacts(
        {"tmpfilename": str(owned)},
        str(tmp_path),
        video_id,
    )

    assert not owned.exists()
    assert nonmatching_stem.exists()
