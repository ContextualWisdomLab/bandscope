"""Reachable fail-closed boundaries left by the canonical Resource Admission lane."""

from __future__ import annotations

import io
import json
import stat
import zipfile
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from bandscope_analysis import api, feature_cache_admission, youtube
from bandscope_analysis.audio_resource_policy import AudioResourcePolicy
from bandscope_analysis.separation.audio_separator import AudioStemSeparator
from bandscope_analysis.temporal import analyzer as temporal_analyzer

_FLOAT32_DTYPE = np.dtype(np.float32)
_FLOAT_OVERFLOW_INT = 10**400


def _single_stem_metadata(duration_seconds: object = 8 / 44_100) -> dict[str, object]:
    """Return one canonical replay sidecar for focused persistence-boundary tests."""
    return {
        "schemaVersion": 1,
        "sampleRate": 44_100,
        "separation": {"duration_seconds": duration_seconds},
        "stemKeys": ["bass"],
        "stemRoleTypes": {"bass": "instrument"},
    }


def _write_single_stem_cache(
    tmp_path: Path,
    *,
    dtype: np.dtype[np.generic] = _FLOAT32_DTYPE,
) -> Path:
    """Write one canonical sidecar/archive pair and return the archive path."""
    arrays_path = tmp_path / "fixture.npz"
    arrays_path.with_suffix(".json").write_text(
        json.dumps(_single_stem_metadata()),
        encoding="utf-8",
    )
    np.savez_compressed(arrays_path, stem_bass=np.arange(8, dtype=dtype))
    return arrays_path


def test_metadata_reader_rejects_descriptor_extent_change(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A sidecar whose bytes outgrow the already-admitted descriptor extent is a cache miss."""
    metadata_path = tmp_path / "fixture.json"
    metadata_path.write_bytes(b"{}")
    monkeypatch.setattr(
        feature_cache_admission.os,
        "fstat",
        lambda _fd: SimpleNamespace(st_mode=stat.S_IFREG, st_size=1),
    )

    assert feature_cache_admission.read_bounded_feature_cache_metadata(metadata_path) is None


def test_replay_policy_fails_closed_when_policy_construction_rejects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A policy-construction failure cannot authorize persisted audio replay."""
    template = AudioResourcePolicy()

    def reject_policy(**_kwargs: object) -> AudioResourcePolicy:
        raise ValueError("invalid derived policy")

    monkeypatch.setattr(feature_cache_admission, "AudioResourcePolicy", reject_policy)
    assert feature_cache_admission._replay_policy(44_100, template) is None


def test_second_read_metadata_covers_optional_rate_and_numeric_failure_boundaries(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Second-read authority accepts omitted rate pinning and rejects hostile numeric conversion."""
    arrays_path = tmp_path / "fixture.npz"
    arrays_path.with_suffix(".json").write_text(
        json.dumps(_single_stem_metadata()),
        encoding="utf-8",
    )
    assert (
        feature_cache_admission._read_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
        )
        is not None
    )

    monkeypatch.setattr(
        feature_cache_admission,
        "read_bounded_feature_cache_metadata",
        lambda *_args, **_kwargs: _single_stem_metadata(_FLOAT_OVERFLOW_INT),
    )
    assert (
        feature_cache_admission._read_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
        )
        is None
    )

    monkeypatch.setattr(
        feature_cache_admission,
        "read_bounded_feature_cache_metadata",
        lambda *_args, **_kwargs: _single_stem_metadata(float("nan")),
    )
    assert (
        feature_cache_admission._read_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
        )
        is None
    )


def test_duration_helper_rejects_numeric_materialization_failure() -> None:
    """A built-in integer that overflows float materialization fails closed."""
    assert not feature_cache_admission._duration_matches_sample_timeline(
        _FLOAT_OVERFLOW_INT,
        44_100,
        44_100,
    )


def test_shared_stem_admission_rejects_shape_identity_and_missing_duration() -> None:
    """Producer/replay Shared Kernel rejects non-mapping, noncanonical, and untimed stems."""
    bass = np.zeros(8, dtype=np.float32)

    assert (
        feature_cache_admission.admit_canonical_stem_set(
            [],
            ["bass"],
            44_100,
            8 / 44_100,
        )
        is None
    )
    assert (
        feature_cache_admission.admit_canonical_stem_set(
            {"guitar": bass},
            ["guitar"],
            44_100,
            8 / 44_100,
        )
        is None
    )
    assert (
        feature_cache_admission.admit_canonical_stem_set(
            {"bass": bass},
            ["bass"],
            44_100,
            None,
        )
        is None
    )


def test_snapshot_helpers_fail_closed_on_short_copy_and_hash_io_failure() -> None:
    """Truncation and snapshot I/O failure cannot become replay evidence."""
    destination = io.BytesIO()
    assert not feature_cache_admission._copy_exact_archive_snapshot(
        io.BytesIO(b"a"),
        destination,  # type: ignore[arg-type]
        2,
    )

    class BrokenSnapshot(io.BytesIO):
        def seek(self, *_args: object, **_kwargs: object) -> int:
            raise OSError("snapshot unavailable")

    assert feature_cache_admission._private_snapshot_sha256(BrokenSnapshot(), 1) is None  # type: ignore[arg-type]


def test_npz_preflight_rejects_uncompressed_and_unsynchronized_members() -> None:
    """Replay preflight rejects unsupported ZIP layout and stem timeline disagreement."""
    policy = AudioResourcePolicy(target_sample_rate=44_100)

    npy = io.BytesIO()
    np.save(npy, np.ones(4, dtype=np.float32), allow_pickle=False)
    uncompressed = io.BytesIO()
    with zipfile.ZipFile(uncompressed, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("stem_bass.npy", npy.getvalue())
    uncompressed.seek(0)
    assert feature_cache_admission._preflight_npz(uncompressed, ["bass"], policy) is None  # type: ignore[arg-type]

    mismatched = io.BytesIO()
    np.savez_compressed(
        mismatched,
        stem_bass=np.ones(4, dtype=np.float32),
        stem_drums=np.ones(5, dtype=np.float32),
    )
    mismatched.seek(0)
    assert (
        feature_cache_admission._preflight_npz(
            mismatched,  # type: ignore[arg-type]
            ["bass", "drums"],
            policy,
        )
        is None
    )


def test_archive_loader_rejects_snapshot_copy_digest_and_preflight_failures(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Immutable replay snapshot failures stop before NumPy materialization."""
    arrays_path = _write_single_stem_cache(tmp_path)

    monkeypatch.setattr(
        feature_cache_admission,
        "_copy_exact_archive_snapshot",
        lambda *_args: False,
    )
    assert feature_cache_admission.load_bounded_stem_archive(arrays_path, ["bass"], 44_100) is None
    monkeypatch.undo()

    assert (
        feature_cache_admission.load_bounded_stem_archive(
            arrays_path,
            ["bass"],
            44_100,
            expected_archive_sha256="00" * 32,
        )
        is None
    )

    monkeypatch.setattr(feature_cache_admission, "_preflight_npz", lambda *_args: None)
    assert feature_cache_admission.load_bounded_stem_archive(arrays_path, ["bass"], 44_100) is None


def test_archive_loader_fails_closed_when_float32_materialization_exhausts_memory(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Legacy floating replay does not escape the cache boundary on allocation failure."""
    arrays_path = _write_single_stem_cache(tmp_path, dtype=np.dtype(np.float64))
    original_array = np.array

    def fail_float32_copy(value: object, *args: object, **kwargs: object) -> np.ndarray:
        if kwargs.get("dtype") is np.float32 or kwargs.get("dtype") == np.float32:
            raise MemoryError("allocation refused")
        return original_array(value, *args, **kwargs)

    monkeypatch.setattr(feature_cache_admission.np, "array", fail_float32_copy)
    assert feature_cache_admission.load_bounded_stem_archive(arrays_path, ["bass"], 44_100) is None


def test_api_cache_store_reports_write_failure_and_default_roles(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Cache publication failure remains non-fatal and canonical default roles stay explicit."""
    assert api._default_stem_role_types(["vocals", "bass"]) == {
        "vocals": "vocal",
        "bass": "instrument",
    }

    request = api.validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-1",
            "sourceLabel": "fixture.wav",
            "roleFocus": [],
            "localSource": {
                "sourcePath": "/app/fixture.wav",
                "fileName": "fixture.wav",
                "extension": "wav",
                "fileSizeBytes": 4,
            },
        }
    )
    features = {
        "stems": {"bass": np.zeros(4, dtype=np.float32)},
        "sr": 44_100,
        "stem_role_types": {"bass": "instrument"},
        "separation": {"duration_seconds": 4 / 44_100, "chunk_count": 1, "notes": "bounded"},
    }

    def fail_savez(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk unavailable")

    monkeypatch.setattr(api.np, "savez_compressed", fail_savez)
    assert not api._store_cached_local_audio_features(
        tmp_path / "fixture.features.json",
        tmp_path / "fixture.features.npz",
        request,
        features,
    )


def test_audio_separator_maps_decoder_exception_and_empty_decode(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Decoder failures and zero-sample output remain typed local-audio rejections."""
    source = tmp_path / "fixture.wav"
    source.write_bytes(b"RIFF")
    separator = AudioStemSeparator()

    def explode_decode(*_args: object, **_kwargs: object) -> tuple[np.ndarray, int]:
        raise RuntimeError("decoder exploded")

    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.decode_mono_audio",
        explode_decode,
    )
    with pytest.raises(ValueError, match="Stem separation decode failed"):
        separator._load_audio(source)

    monkeypatch.setattr(
        "bandscope_analysis.separation.audio_separator.decode_mono_audio",
        lambda *_args, **_kwargs: (np.array([], dtype=np.float32), 44_100),
    )
    with pytest.raises(ValueError, match="Stem separation decode failed"):
        separator._load_audio(source)


def test_temporal_failure_message_redacts_unallowlisted_payload() -> None:
    """Unexpected decoder details never become temporal diagnostics."""
    secret = "/private/rehearsal.wav failed"
    message = temporal_analyzer._safe_temporal_failure_message(RuntimeError(secret))
    assert secret not in message
    assert message == temporal_analyzer._GENERIC_TEMPORAL_FAILURE_MESSAGE


def test_youtube_cleanup_duration_and_status_edges(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Lease cleanup and metadata parsing fail closed without escaping local paths."""
    monkeypatch.setattr(youtube.os, "rmdir", lambda _path: (_ for _ in ()).throw(OSError("busy")))
    youtube._release_import_lease(str(tmp_path / "lease"))

    rejection = youtube._reject_invalid_or_oversize_duration(
        {"duration": youtube.DEFAULT_MAX_DURATION_SECONDS + 1}
    )
    assert rejection is not None
    assert rejection["error"]["code"] == "duration_exceeded"

    video_id = "abcdefghijk"
    candidate = tmp_path / f"{video_id}.webm.part"
    assert youtube._video_id_from_status({"tmpfilename": 7, "filename": str(candidate)}) == video_id
    assert youtube._cleanup_stem(f"{video_id}.webm-Fragoops") == f"{video_id}.webm-Fragoops"
    assert youtube._cleanup_stem("other-Frag1.part") == "other-Frag1"
    assert youtube._cleanup_stem("not-a-video-id-Frag1.part") == "not-a-video-id"


def test_youtube_owned_cleanup_tolerates_remove_and_directory_listing_races(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Current-lease cleanup tolerates disappearing files and output directories."""
    video_id = "abcdefghijk"
    final_path = tmp_path / f"{video_id}.m4a"
    final_path.write_bytes(b"audio")

    monkeypatch.setattr(youtube.os, "remove", lambda _path: (_ for _ in ()).throw(OSError("gone")))
    youtube._remove_owned_file(str(final_path), str(tmp_path))
    youtube._remove_video_owned_file(str(final_path), str(tmp_path), video_id)

    part_path = tmp_path / f"{video_id}.webm.part"
    part_path.write_bytes(b"partial")
    monkeypatch.setattr(youtube.os, "remove", lambda _path: None)
    monkeypatch.setattr(youtube.os, "listdir", lambda _path: (_ for _ in ()).throw(OSError("gone")))
    youtube._remove_download_artifacts(
        {"tmpfilename": str(part_path)},
        str(tmp_path),
        video_id,
    )


def test_youtube_second_extract_info_failures_are_payload_safe(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A vanished or identity-swapped post-download result never becomes an owned artifact."""
    video_id = "abcdefghijk"
    url = f"https://www.youtube.com/watch?v={video_id}"

    class FakeYdl:
        def __init__(self, _opts: object, second: object) -> None:
            self.second = second
            self.calls = 0

        def __enter__(self) -> "FakeYdl":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def extract_info(self, _url: str, *, download: bool) -> object:
            self.calls += 1
            if not download:
                return {"id": video_id, "duration": 1.0}
            return self.second

        def prepare_filename(self, _info: object) -> str:
            return str(tmp_path / f"{video_id}.webm")

    for second in (None, {"id": "zzzzzzzzzzz", "duration": 1.0}):
        monkeypatch.setattr(
            youtube.yt_dlp,
            "YoutubeDL",
            lambda opts, second=second: FakeYdl(opts, second),
        )
        result = youtube.download_youtube_audio(url, str(tmp_path))
        assert result["ok"] is False
        assert result["error"]["code"] in {"download_error", "download_failed"}
        lease = tmp_path / f".{video_id}.importing"
        assert not lease.exists()
