"""Regression coverage for cached authoritative temporal analysis features."""

import numpy as np

import bandscope_analysis.api as api


def _request(tmp_path, *, cache: bool = True):
    """Build the local-audio request used by temporal cache regressions."""
    payload = {
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
    }
    if cache:
        payload["cacheRoot"] = str(tmp_path / "cache")
    return api.validate_analysis_job_request(payload)


def _features():
    """Return reusable stems with a source-derived authoritative temporal grid."""
    return {
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


def _song():
    """Return a minimal valid result so orchestration tests stay focused on decoding."""
    return {
        "id": "temporal-cache-song",
        "title": "Late Night Set",
        "sections": [],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Temporal cache regression",
            "focusSections": [],
        },
    }


def _unexpected_temporal_redecode(_request):
    """Fail a regression if orchestration opens the source solely for timing again."""
    raise AssertionError("authoritative temporal grid must not trigger a second source decode")


def test_feature_cache_round_trips_authoritative_tempo_grid(tmp_path) -> None:
    """Reuse source-derived BPM and beats instead of decoding the source again."""
    request = _request(tmp_path)
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    assert api._store_cached_local_audio_features(metadata_path, arrays_path, request, _features())
    loaded = api._load_cached_local_audio_features(metadata_path, arrays_path)

    assert loaded is not None
    assert loaded["bpm"] == 120.0
    assert loaded["beat_times"] == [0.0, 0.5, 1.0]


def test_fresh_source_temporal_grid_skips_second_decode(monkeypatch, tmp_path) -> None:
    """Keep source timing returned by separation without opening the source again."""
    request = _request(tmp_path, cache=False)
    monkeypatch.setattr(api, "_build_local_audio_features", lambda _request: _features())
    monkeypatch.setattr(api, "_temporal_features_for_request", _unexpected_temporal_redecode)
    monkeypatch.setattr(api, "build_demo_rehearsal_song", lambda _features: _song())

    updates = api.run_analysis_job_updates("job-fresh-grid", request, "2026-08-28T00:00:00Z")

    assert updates[-1]["state"] == "succeeded"


def test_cached_source_temporal_grid_skips_second_decode(monkeypatch, tmp_path) -> None:
    """Keep the persisted source timing on feature-cache hits without source I/O."""
    request = _request(tmp_path)
    cache_paths = api._feature_cache_paths(request)
    assert cache_paths is not None
    assert api._store_cached_local_audio_features(*cache_paths, request, _features())
    monkeypatch.setattr(api, "_temporal_features_for_request", _unexpected_temporal_redecode)
    monkeypatch.setattr(api, "build_demo_rehearsal_song", lambda _features: _song())

    updates = api.run_analysis_job_updates("job-cached-grid", request, "2026-08-28T00:00:00Z")

    assert updates[-1]["state"] == "succeeded"
    assert any(
        update.get("progressLabel") == "Loaded reusable stems... (45%)" for update in updates
    )
