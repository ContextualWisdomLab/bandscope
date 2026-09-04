"""Regression coverage for independent final-result and feature cache schemas."""

from unittest.mock import patch

from bandscope_analysis.api import (
    _analysis_cache_path,
    _feature_cache_paths,
    validate_analysis_job_request,
)


def test_feature_cache_paths_survive_final_analysis_schema_bumps(tmp_path) -> None:
    """Keep reusable separated stems when only the final result schema changes."""
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
        }
    )
    original_analysis_path = _analysis_cache_path(request)
    original_feature_paths = _feature_cache_paths(request)

    with patch("bandscope_analysis.api.ANALYSIS_CACHE_SCHEMA_VERSION", 999):
        bumped_analysis_path = _analysis_cache_path(request)
        bumped_feature_paths = _feature_cache_paths(request)

    assert bumped_analysis_path != original_analysis_path
    assert bumped_feature_paths == original_feature_paths
