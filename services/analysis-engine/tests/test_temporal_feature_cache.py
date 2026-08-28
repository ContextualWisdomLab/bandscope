"""Regression coverage for cached authoritative temporal analysis features."""

import numpy as np

from bandscope_analysis.api import (
    _load_cached_local_audio_features,
    _store_cached_local_audio_features,
    validate_analysis_job_request,
)


def test_feature_cache_round_trips_authoritative_tempo_grid(tmp_path) -> None:
    """Reuse source-derived BPM and beats instead of decoding the source again."""
    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-temporal-cache",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": ["lead-vocal"],
            "localSource": {
                "sourcePath": "/Users/test/Music/late-night-set.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
            "cacheRoot": str(tmp_path / "cache"),
        }
    )
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    features = {
        "stems": {"vocals": np.asarray([0.1, -0.1], dtype=np.float32)},
        "sr": 44100,
        "stem_role_types": {"vocals": "vocal"},
        "separation": {
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "notes": "test stems",
        },
        "bpm": 120.0,
        "beat_times": [0.0, 0.5, 1.0],
    }

    assert _store_cached_local_audio_features(metadata_path, arrays_path, request, features)
    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert loaded["bpm"] == 120.0
    assert loaded["beat_times"] == [0.0, 0.5, 1.0]
