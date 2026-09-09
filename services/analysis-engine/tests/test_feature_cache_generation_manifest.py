"""Regressions for versioned persisted feature-cache generation binding."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from bandscope_analysis.api import (
    _load_cached_local_audio_features,
    _store_cached_local_audio_features,
)

_SOURCE_SHA256 = "ab" * 32
_OTHER_SOURCE_SHA256 = "cd" * 32


def _cache_paths(
    tmp_path: Path,
    source_sha256: str = _SOURCE_SHA256,
) -> tuple[Path, Path]:
    """Return one production-shaped source-digest cache namespace."""
    cache_root = (
        tmp_path
        / "cache"
        / "source-sha256-v1"
        / source_sha256
        / "analysis-cache-v1"
    )
    return cache_root / "fixture.features.json", cache_root / "fixture.features.npz"


def _request() -> dict[str, object]:
    """Return the minimal local-source metadata persisted with reusable stems."""
    return {
        "sourceKind": "local_audio",
        "sourceLabel": "rehearsal.wav",
        "roleFocus": [],
        "projectId": "project-1",
        "localSource": {
            "sourcePath": "/app-owned/project/source.wav",
            "fileName": "rehearsal.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
    }


def _features() -> dict[str, object]:
    """Return one synchronized canonical stem suitable for cache persistence."""
    sample_rate = 44_100
    return {
        "stems": {"bass": np.linspace(-1.0, 1.0, 16, dtype=np.float32)},
        "sr": sample_rate,
        "stem_role_types": {"bass": "instrument"},
        "separation": {
            "duration_seconds": 16 / sample_rate,
            "chunk_count": 1,
            "notes": "generation-bound rehearsal stem",
        },
    }


def test_production_feature_cache_requires_generation_manifest(tmp_path: Path) -> None:
    """A source-scoped production cache hit requires the last-published manifest."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    assert _store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features(),
    )

    loaded = _load_cached_local_audio_features(
        metadata_path,
        arrays_path,
        require_manifest=True,
    )

    assert loaded is not None
    assert np.array_equal(loaded["stems"]["bass"], _features()["stems"]["bass"])


def test_missing_generation_manifest_forces_recompute(tmp_path: Path) -> None:
    """A partial publication without its commit marker is never rehearsal evidence."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    assert _store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features(),
    )
    metadata_path.with_suffix(".manifest.json").unlink()

    assert (
        _load_cached_local_audio_features(metadata_path, arrays_path, require_manifest=True)
        is None
    )


def test_generation_manifest_rejects_metadata_replacement(tmp_path: Path) -> None:
    """Metadata from another generation cannot pair with an admitted stem archive."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    assert _store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features(),
    )
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["separation"]["notes"] = "replaced after publication"
    metadata_path.write_text(
        json.dumps(metadata, separators=(",", ":")),
        encoding="utf-8",
    )

    assert (
        _load_cached_local_audio_features(metadata_path, arrays_path, require_manifest=True)
        is None
    )


def test_generation_manifest_rejects_stem_archive_replacement(tmp_path: Path) -> None:
    """Same-shape replacement audio cannot reuse a generation committed for other samples."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    assert _store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features(),
    )
    np.savez_compressed(arrays_path, stem_bass=np.ones(16, dtype=np.float32))

    assert (
        _load_cached_local_audio_features(metadata_path, arrays_path, require_manifest=True)
        is None
    )


def test_generation_manifest_rejects_cross_source_namespace_copy(tmp_path: Path) -> None:
    """A committed cache generation cannot be copied under another verified source identity."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    assert _store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features(),
    )

    other_metadata, other_arrays = _cache_paths(tmp_path, _OTHER_SOURCE_SHA256)
    other_metadata.parent.mkdir(parents=True, exist_ok=True)
    other_metadata.write_bytes(metadata_path.read_bytes())
    other_arrays.write_bytes(arrays_path.read_bytes())
    other_metadata.with_suffix(".manifest.json").write_bytes(
        metadata_path.with_suffix(".manifest.json").read_bytes()
    )

    assert (
        _load_cached_local_audio_features(other_metadata, other_arrays, require_manifest=True)
        is None
    )
