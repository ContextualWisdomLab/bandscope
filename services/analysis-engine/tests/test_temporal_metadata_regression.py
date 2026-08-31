"""Regressions for persisted temporal metadata and local recording labels."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

from bandscope_analysis import api as analysis_api


def _local_request(tmp_path: Path) -> analysis_api.AnalysisJobRequest:
    """Build the smallest valid local-audio request used by these regressions."""
    return {
        "sourceKind": "local_audio",
        "sourceLabel": "rehearsal-take.wav",
        "roleFocus": [],
        "projectId": "project-1",
        "cacheRoot": str(tmp_path),
        "localSource": {
            "sourcePath": str(tmp_path / "rehearsal-take.wav"),
            "fileName": "rehearsal-take.wav",
            "extension": "wav",
            "fileSizeBytes": 1,
        },
    }


def test_temporal_failure_keeps_operator_recording_label(tmp_path: Path) -> None:
    """Keep the known source label when temporal DSP cannot read the recording."""
    request = _local_request(tmp_path)

    with patch.object(
        analysis_api,
        "TemporalAnalyzer",
        side_effect=FileNotFoundError("unreadable recording"),
    ):
        assert analysis_api._build_local_temporal_features(request) == {
            "title": "rehearsal-take.wav"
        }


def test_pre_temporal_full_analysis_cache_is_invalidated(tmp_path: Path) -> None:
    """Reject schema-v1 full results while retaining the independent feature cache schema."""
    legacy_cache = tmp_path / "legacy-analysis.json"
    legacy_cache.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "source": {
                    "fileName": "rehearsal-take.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1,
                },
                "result": {
                    "id": "demo-song",
                    "title": "Late Night Set",
                    "sections": [],
                    "exportSummary": {
                        "format": "cue-sheet",
                        "headline": "Old cached result",
                        "focusSections": [],
                    },
                },
            }
        ),
        encoding="utf-8",
    )

    assert analysis_api._load_cached_analysis(legacy_cache) is None
    assert analysis_api.FEATURE_CACHE_SCHEMA_VERSION == 1

    new_cache_path = analysis_api._analysis_cache_path(_local_request(tmp_path))
    assert new_cache_path is not None
    assert new_cache_path.parent.name == "analysis-cache-v2"
