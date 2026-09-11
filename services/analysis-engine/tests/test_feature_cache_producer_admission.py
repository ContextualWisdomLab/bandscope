"""Regression tests for feature-cache producer stem admission."""

import importlib

import numpy as np

api = importlib.import_module("bandscope_analysis.api")


_SAMPLE_RATE = 22_050
_SAMPLE_COUNT = 4


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


def test_feature_cache_producer_rejects_noncanonical_audio_stem_before_publication(
    tmp_path,
) -> None:
    """A producer cannot publish a cache the canonical replay boundary must reject."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features("guitar"),
    )

    assert stored is False
    assert not metadata_path.exists()
    assert not arrays_path.exists()


def test_feature_cache_producer_accepts_canonical_audio_stem_subset(tmp_path) -> None:
    """A valid canonical audio stem subset remains publishable."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"

    stored = api._store_cached_local_audio_features(
        metadata_path,
        arrays_path,
        _request(),
        _features("bass"),
    )

    assert stored is True
    assert metadata_path.exists()
    assert arrays_path.exists()


def test_feature_cache_producer_rejects_duration_that_replay_would_reject(
    tmp_path,
) -> None:
    """Producer admission must reject a stem timeline that replay rejects."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"
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
    assert not metadata_path.exists()
    assert not arrays_path.exists()
