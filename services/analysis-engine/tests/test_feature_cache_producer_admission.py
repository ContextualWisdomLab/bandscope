"""Regression tests for feature-cache producer stem admission."""

import importlib

import numpy as np

api = importlib.import_module("bandscope_analysis.api")


_SAMPLE_RATE = 22_050
_SAMPLE_COUNT = 4
_SOURCE_SHA256 = "a" * 64


def _request() -> dict[str, object]:
    """Return the minimal validated-shape local-audio request needed by cache storage."""
    return {
        "sourceKind": "local_audio",
        "projectId": "project-cache",
        "sourceLabel": "track.wav",
        "roleFocus": ["bass-guitar"],
        "localSource": {
            "sourcePath": "/app/project/source/track.wav",
            "fileName": "track.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
    }


def _features(stem_name: str) -> dict[str, object]:
    """Return one internally consistent stem feature payload for producer admission."""
    return {
        "stems": {stem_name: np.zeros(_SAMPLE_COUNT, dtype=np.float32)},
        "sr": _SAMPLE_RATE,
        "stem_role_types": {stem_name: "vocal" if stem_name == "vocals" else "instrument"},
        "separation": {
            "duration_seconds": _SAMPLE_COUNT / _SAMPLE_RATE,
            "chunk_count": 1,
            "notes": "producer admission fixture",
        },
    }


def _cache_paths(tmp_path):
    """Return production-shaped feature paths below one verified source namespace."""
    cache_dir = tmp_path / "source-sha256-v1" / _SOURCE_SHA256
    return cache_dir / "track.features.json", cache_dir / "track.features.npz"


def _assert_not_published(metadata_path, arrays_path) -> None:
    """Assert that validation failure leaves no committed cache generation."""
    assert not metadata_path.exists()
    assert not arrays_path.exists()
    assert not metadata_path.with_suffix(".manifest.json").exists()


def test_feature_cache_producer_rejects_noncanonical_audio_stem_before_publication(
    tmp_path,
) -> None:
    """A producer cannot publish a cache the canonical replay boundary must reject."""
    metadata_path, arrays_path = _cache_paths(tmp_path)

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features("guitar"),
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_accepts_canonical_audio_stem_subset(tmp_path) -> None:
    """A valid canonical audio stem subset remains publishable."""
    metadata_path, arrays_path = _cache_paths(tmp_path)

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features("bass"),
    )

    assert stored is True
    assert metadata_path.exists()
    assert arrays_path.exists()
    assert metadata_path.with_suffix(".manifest.json").exists()


def test_feature_cache_producer_rejects_duration_that_replay_would_reject(
    tmp_path,
) -> None:
    """Producer admission must reject a stem timeline that replay rejects."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    separation = features["separation"]
    assert isinstance(separation, dict)
    separation["duration_seconds"] = 1.0

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_unsynchronized_stem_lengths(tmp_path) -> None:
    """One cache generation cannot publish stems with different sample timelines."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    features["stems"] = {
        "bass": np.zeros(_SAMPLE_COUNT, dtype=np.float32),
        "drums": np.zeros(_SAMPLE_COUNT + 1, dtype=np.float32),
    }
    features["stem_role_types"] = {"bass": "instrument", "drums": "instrument"}

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_nonfinite_stem_samples(tmp_path) -> None:
    """Non-finite producer samples cannot cross the feature-cache boundary."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    features["stems"] = {
        "bass": np.array([0.0, np.nan, 0.0, 0.0], dtype=np.float32),
    }

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_noncanonical_dtype(tmp_path) -> None:
    """Producer publication requires canonical float32 rather than replay coercion."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    features["stems"] = {"bass": np.zeros(_SAMPLE_COUNT, dtype=np.float64)}

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_nonowned_stem_view(tmp_path) -> None:
    """Producer publication cannot rely on a mutable view owned by another array."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    owner = np.zeros(_SAMPLE_COUNT * 2, dtype=np.float32)
    features["stems"] = {"bass": owner[::2]}

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_noncanonical_role_binding(tmp_path) -> None:
    """Canonical stem identity and role metadata must remain one invariant."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    features["stem_role_types"] = {"bass": "vocal"}

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)


def test_feature_cache_producer_rejects_unsupported_sample_rate(tmp_path) -> None:
    """A producer cannot publish a rate outside the canonical decode policy."""
    metadata_path, arrays_path = _cache_paths(tmp_path)
    features = _features("bass")
    features["sr"] = api.DEFAULT_AUDIO_RESOURCE_POLICY.min_source_sample_rate - 1

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        features,
    )

    assert stored is False
    _assert_not_published(metadata_path, arrays_path)
