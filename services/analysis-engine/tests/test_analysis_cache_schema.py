"""Regression coverage for full-analysis cache schema evolution."""

import json
from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    _analysis_cache_path,
    _feature_cache_paths,
    _store_cached_local_audio_features,
    build_demo_rehearsal_song,
    run_analysis_job_updates,
    validate_analysis_job_request,
)


def test_new_analysis_schema_ignores_v1_result_but_reuses_v1_features(tmp_path) -> None:
    """A result-contract bump must not throw away compatible separated-stem features."""
    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-cache",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": "/Users/test/Music/late-night-set.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
            "cacheRoot": str(tmp_path / "cache"),
            "tempRoot": str(tmp_path / "temp"),
        }
    )
    feature_paths = _feature_cache_paths(request)
    analysis_path = _analysis_cache_path(request)
    assert feature_paths is not None
    assert analysis_path is not None
    metadata_path, arrays_path = feature_paths

    # Before the result schema bump, the full result lived beside feature files
    # under analysis-cache-v1 and shared their v1 digest stem.
    legacy_analysis_path = metadata_path.with_name(
        metadata_path.name.removesuffix(".features.json") + ".json"
    )
    legacy_analysis_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_analysis_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "source": {},
                "result": {
                    "id": "stale-v1-result",
                    "title": "Stale cached result",
                    "sections": [],
                    "exportSummary": {
                        "format": "cue-sheet",
                        "headline": "stale",
                        "focusSections": [],
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    reusable_features = {
        "stems": {
            "vocals": np.zeros(256),
            "bass": np.zeros(256),
            "drums": np.zeros(256),
            "other": np.zeros(256),
        },
        "sr": 22050,
        "stem_role_types": {
            "vocals": "vocal",
            "bass": "instrument",
            "drums": "instrument",
            "other": "instrument",
        },
        "separation": {
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "notes": "Separated selected local audio into 4 canonical stems.",
        },
    }
    assert _store_cached_local_audio_features(
        metadata_path, arrays_path, request, reusable_features
    ) is True

    fresh_result = build_demo_rehearsal_song()
    with (
        patch("bandscope_analysis.api._run_stem_separation_with_timeout") as separator,
        patch("bandscope_analysis.api.build_demo_rehearsal_song", return_value=fresh_result),
    ):
        updates = list(
            run_analysis_job_updates(
                "job-schema-v2", request, "2026-08-30T00:00:00Z"
            )
        )

    assert analysis_path.parent.name == "analysis-cache-v2"
    assert metadata_path.parent.name == "analysis-cache-v1"
    assert updates[-1]["result"] == fresh_result
    assert updates[-1]["result"]["id"] != "stale-v1-result"
    assert any(
        update.get("progressLabel") == "Loaded reusable stems... (45%)"
        for update in updates
    )
    separator.assert_not_called()
