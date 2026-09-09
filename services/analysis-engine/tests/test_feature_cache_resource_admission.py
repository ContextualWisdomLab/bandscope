"""Regressions for resource admission when replaying cached audio stems."""

from __future__ import annotations

import json
import os
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock

import numpy as np
import pytest

from bandscope_analysis.api import _load_cached_local_audio_features
from bandscope_analysis.audio_resource_policy import AudioResourcePolicy
from bandscope_analysis.feature_cache_admission import _copy_exact_archive_snapshot


def _write_metadata(
    path: Path,
    *,
    sample_rate: int = 44_100,
    stem_key: str = "bass",
) -> None:
    """Write the smallest valid feature-cache metadata envelope for one stem."""
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": sample_rate,
                "separation": {
                    "duration_seconds": 1.0,
                    "chunk_count": 1,
                    "notes": "cached rehearsal stem",
                },
                "stemKeys": [stem_key],
                "stemRoleTypes": {stem_key: "vocal" if stem_key == "vocals" else "instrument"},
            }
        ),
        encoding="utf-8",
    )


def test_feature_cache_replay_canonicalizes_finite_float_stems(tmp_path: Path) -> None:
    """Legacy floating caches become owned canonical float32 before MIR reuse."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.linspace(-1.0, 1.0, 16, dtype=np.float64))

    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert loaded["stems"]["bass"].dtype == np.dtype(np.float32)
    assert loaded["stems"]["bass"].flags.owndata


def test_feature_cache_replay_rejects_multidimensional_stem(tmp_path: Path) -> None:
    """A cached channel/batch axis cannot be flattened into rehearsal evidence."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.zeros((2, 8), dtype=np.float32))

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_nonfinite_stem(tmp_path: Path) -> None:
    """NaN or infinite cached samples fail closed before downstream MIR reuse."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.array([0.0, np.nan], dtype=np.float32))

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_unsupported_sample_rate(tmp_path: Path) -> None:
    """Cache metadata cannot invent an analysis rate outside the audio policy bounds."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path, sample_rate=7_999)
    np.savez_compressed(arrays_path, stem_bass=np.zeros(8, dtype=np.float32))

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_noncanonical_stem_identity(tmp_path: Path) -> None:
    """Persisted metadata cannot invent a stem the canonical separator never emits."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path, stem_key="guitar")
    np.savez_compressed(arrays_path, stem_guitar=np.zeros(8, dtype=np.float32))

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_oversized_member_before_decompression(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Declared cached PCM above policy is rejected before NumPy materializes the member."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path, sample_rate=8_000)
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))

    tiny_policy = AudioResourcePolicy(
        target_sample_rate=8_000,
        max_duration_seconds=0.001,
        max_decoded_audio_bytes=32,
    )
    monkeypatch.setattr("bandscope_analysis.api.DEFAULT_AUDIO_RESOURCE_POLICY", tiny_policy)
    load_mock = Mock(side_effect=AssertionError("oversized member must fail before np.load"))
    monkeypatch.setattr("bandscope_analysis.api.np.load", load_mock)

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None
    load_mock.assert_not_called()


def test_feature_cache_replay_treats_numpy_allocator_exhaustion_as_cache_miss(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Allocator exhaustion while opening an admitted NPZ cannot crash the analysis job."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))

    load_mock = Mock(side_effect=MemoryError("allocator exhausted while opening cached stems"))
    monkeypatch.setattr("bandscope_analysis.feature_cache_admission.np.load", load_mock)

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None
    load_mock.assert_called_once()


def _write_two_stem_cache(metadata_path: Path, arrays_path: Path, *, drum_samples: int) -> None:
    """Write canonical bass/drums cache data with a configurable drums timeline."""
    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": 44_100,
                "separation": {
                    "duration_seconds": 1.0,
                    "chunk_count": 1,
                    "notes": "cached rehearsal stems",
                },
                "stemKeys": ["bass", "drums"],
                "stemRoleTypes": {"bass": "instrument", "drums": "instrument"},
            }
        ),
        encoding="utf-8",
    )
    np.savez_compressed(
        arrays_path,
        stem_bass=np.zeros(16, dtype=np.float32),
        stem_drums=np.zeros(drum_samples, dtype=np.float32),
    )


def test_feature_cache_replay_accepts_aligned_stem_timelines(tmp_path: Path) -> None:
    """Canonical persisted stems with one shared sample timeline remain reusable."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_two_stem_cache(metadata_path, arrays_path, drum_samples=16)

    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert set(loaded["stems"]) == {"bass", "drums"}
    assert loaded["stems"]["bass"].shape == loaded["stems"]["drums"].shape == (16,)


def test_feature_cache_replay_rejects_metadata_duration_outside_stem_timeline(
    tmp_path: Path,
) -> None:
    """Cached duration must describe the exact persisted stem timeline used by MIR."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    metadata_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata_payload["separation"]["duration_seconds"] = 2.0
    metadata_path.write_text(json.dumps(metadata_payload), encoding="utf-8")
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_misaligned_stem_lengths_before_materialization(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Persisted stems must preserve one synchronized sample timeline before MIR reuse."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_two_stem_cache(metadata_path, arrays_path, drum_samples=8)

    load_mock = Mock(side_effect=AssertionError("misaligned stems must fail before np.load"))
    monkeypatch.setattr("bandscope_analysis.feature_cache_admission.np.load", load_mock)

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None
    load_mock.assert_not_called()


def test_feature_cache_snapshot_copy_rejects_short_source() -> None:
    """A cache truncated below its admitted extent cannot form a replay snapshot."""
    assert not _copy_exact_archive_snapshot(BytesIO(b"x"), BytesIO(), 2)


def test_feature_cache_replay_ignores_path_mutation_after_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mutation after snapshot creation cannot change the admitted replay bytes."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))

    real_load = np.load

    def mutate_archive_then_load(archive_file, *args, **kwargs):
        np.savez_compressed(
            arrays_path,
            stem_bass=np.arange(1024, dtype=np.float32),
        )
        archive_file.seek(0)
        return real_load(archive_file, *args, **kwargs)

    monkeypatch.setattr(
        "bandscope_analysis.feature_cache_admission.np.load",
        mutate_archive_then_load,
    )

    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert loaded["stems"]["bass"].shape == (16,)
    assert np.count_nonzero(loaded["stems"]["bass"]) == 0


def test_feature_cache_replay_materializes_one_admitted_archive_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Replay uses one admitted byte snapshot even if file metadata is restored."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    replacement_path = tmp_path / "replacement.npz"
    _write_metadata(metadata_path)
    np.savez_compressed(arrays_path, stem_bass=np.full(16, -0.0, dtype=np.float32))
    np.savez_compressed(replacement_path, stem_bass=np.ones(16, dtype=np.float32))

    admitted_stat = arrays_path.stat()
    replacement_bytes = replacement_path.read_bytes()
    assert len(replacement_bytes) == admitted_stat.st_size
    real_load = np.load

    def replace_bytes_then_load(archive_file, *args, **kwargs):
        arrays_path.write_bytes(replacement_bytes)
        changed_stat = arrays_path.stat()
        assert (changed_stat.st_dev, changed_stat.st_ino, changed_stat.st_size) == (
            admitted_stat.st_dev,
            admitted_stat.st_ino,
            admitted_stat.st_size,
        )
        os.utime(
            arrays_path,
            ns=(changed_stat.st_atime_ns, admitted_stat.st_mtime_ns),
        )
        restored_stat = arrays_path.stat()
        assert restored_stat.st_mtime_ns == admitted_stat.st_mtime_ns
        archive_file.seek(0)
        return real_load(archive_file, *args, **kwargs)

    monkeypatch.setattr(
        "bandscope_analysis.feature_cache_admission.np.load",
        replace_bytes_then_load,
    )

    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert np.signbit(loaded["stems"]["bass"]).all()
