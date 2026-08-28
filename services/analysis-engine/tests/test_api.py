"""Tests for the public analysis-engine API helpers."""

import queue
import time
from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    _build_local_audio_features,
    _feature_cache_paths,
    _load_cached_analysis,
    _load_cached_local_audio_features,
    _run_stem_separation_with_timeout,
    _stem_separation_worker,
    _stem_work_arrays_path,
    _stop_process,
    _store_cached_analysis,
    _store_cached_local_audio_features,
    build_demo_rehearsal_song,
    build_section_time_range,
    get_analysis_status,
    run_analysis_job,
    run_analysis_job_updates,
    validate_analysis_job_request,
)


def test_get_analysis_status_returns_health_payload() -> None:
    """Ensure the API helper returns the expected bootstrap status payload."""
    assert get_analysis_status() == {
        "service": "bandscope-analysis",
        "status": "ready",
        "pipeline_stages": ["decode", "draft", "separate", "persist"],
    }


def test_validate_analysis_job_request_accepts_demo_payload() -> None:
    """Ensure valid demo requests are normalized without modification."""
    assert validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar", "lead-vocal"],
        }
    ) == {
        "sourceKind": "demo",
        "sourceLabel": "Late Night Set",
        "roleFocus": ["bass-guitar", "lead-vocal"],
    }


def test_validate_analysis_job_request_accepts_local_audio_payload() -> None:
    """Ensure valid local-audio requests are normalized without modification."""
    assert validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-1",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": ["bass-guitar", "lead-vocal"],
            "localSource": {
                "sourcePath": "/Users/test/Music/late-night-set.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
            "cacheRoot": "/tmp/bandscope/cache/project-1",
            "tempRoot": "/tmp/bandscope/temp/project-1",
        }
    ) == {
        "sourceKind": "local_audio",
        "projectId": "project-1",
        "sourceLabel": "late-night-set.wav",
        "roleFocus": ["bass-guitar", "lead-vocal"],
        "localSource": {
            "sourcePath": "/Users/test/Music/late-night-set.wav",
            "fileName": "late-night-set.wav",
            "extension": "wav",
            "fileSizeBytes": 1024000,
        },
        "cacheRoot": "/tmp/bandscope/cache/project-1",
        "tempRoot": "/tmp/bandscope/temp/project-1",
    }


def test_validate_analysis_job_request_rejects_bad_payloads() -> None:
    """Ensure the request validator reports every expected safe-failure path."""
    cases = [
        ([], "root"),
        ({}, "sourceKind"),
        ({"sourceKind": "file", "sourceLabel": "Late Night Set", "roleFocus": []}, "sourceKind"),
        ({"sourceKind": "demo", "roleFocus": []}, "sourceLabel"),
        ({"sourceKind": "demo", "sourceLabel": "   ", "roleFocus": []}, "sourceLabel"),
        ({"sourceKind": "demo", "sourceLabel": "Late Night Set", "roleFocus": {}}, "roleFocus"),
        ({"sourceKind": "demo", "sourceLabel": "Late Night Set", "roleFocus": [7]}, "roleFocus[0]"),
        (
            {"sourceKind": "local_audio", "sourceLabel": "Late Night Set", "roleFocus": []},
            "projectId",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
            },
            "localSource",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "localSource.sourcePath",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "ogg",
                    "fileSizeBytes": 1024000,
                },
            },
            "localSource.extension",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "localSource.fileName",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 0,
                },
            },
            "localSource.fileSizeBytes",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": [],
            },
            "localSource",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                    "extra": True,
                },
            },
            "localSource.extra",
        ),
        (
            {
                "sourceKind": "demo",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "projectId",
        ),
        (
            {"sourceKind": "demo", "sourceLabel": "Late Night Set", "roleFocus": [], "extra": True},
            "extra",
        ),
        (
            {
                "sourceKind": "demo",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "cacheRoot": "/tmp/bandscope/cache",
            },
            "cacheRoot",
        ),
        (
            {
                "sourceKind": "demo",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "tempRoot": "/tmp/bandscope/temp",
            },
            "tempRoot",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
                "cacheRoot": " ",
            },
            "cacheRoot",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
                "tempRoot": [],
            },
            "tempRoot",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
                "cacheRoot": "/tmp/../cache",
            },
            "path traversal",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
                "tempRoot": "C:\\Windows\\..\\Temp",
            },
            "path traversal",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "../secret.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "path traversal",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "../project-1",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "path traversal",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "..",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "path traversal",
        ),
        (
            {
                "sourceKind": "local_audio",
                "projectId": "proj\\escape",
                "sourceLabel": "Late Night Set",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "path traversal",
        ),
    ]

    for payload, message in cases:
        try:
            validate_analysis_job_request(payload)
        except ValueError as error:
            assert message in str(error)
        else:
            raise AssertionError(f"Expected ValueError for {payload!r}")


def test_validate_analysis_job_request_allows_project_id_with_dotdot_substring() -> None:
    """Identifiers that only contain '..' as a substring remain valid."""
    result = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "my..id",
            "sourceLabel": "late-night-set.wav",
            "roleFocus": [],
            "localSource": {
                "sourcePath": "/Users/test/Music/late-night-set.wav",
                "fileName": "late-night-set.wav",
                "extension": "wav",
                "fileSizeBytes": 1024000,
            },
        }
    )
    assert result["projectId"] == "my..id"


def test_build_demo_rehearsal_song_matches_expected_fixture() -> None:
    """Ensure the bootstrap demo result is present and player-relevant."""
    song = build_demo_rehearsal_song()

    assert song["title"] == "Late Night Set"
    assert song.get("tempo") is None
    assert song["sections"][0]["timeRange"] == {"start": 10, "end": 30}
    assert song["sections"][0]["roles"][0]["id"] == "bass-guitar"
    assert song["sections"][0]["roles"][4]["manualOverrides"][0]["value"]["source"] == "user"


def test_build_demo_rehearsal_song_with_tempo() -> None:
    """Ensure build_demo_rehearsal_song incorporates tempo from audio features."""
    song = build_demo_rehearsal_song({"bpm": 120.4})
    assert song.get("tempo") == 120


def test_coerce_tempo_bpm() -> None:
    """Ensure _coerce_tempo_bpm handles various edge cases correctly."""
    import numpy as np

    from bandscope_analysis.api import _coerce_tempo_bpm

    assert _coerce_tempo_bpm(120.4) == 120
    assert _coerce_tempo_bpm(120) == 120
    assert _coerce_tempo_bpm(True) is None
    assert _coerce_tempo_bpm(False) is None
    assert _coerce_tempo_bpm("120") is None
    assert _coerce_tempo_bpm(None) is None
    assert _coerce_tempo_bpm(np.nan) is None
    assert _coerce_tempo_bpm(np.inf) is None
    assert _coerce_tempo_bpm(-np.inf) is None
    assert _coerce_tempo_bpm(0) is None
    assert _coerce_tempo_bpm(-120) is None


def test_build_section_time_range_matches_desktop_bounds() -> None:
    """Ensure Python output cannot exceed the shared Rust u32 timing contract."""
    assert build_section_time_range(10, 30) == {"start": 10, "end": 30}

    cases = [
        (-1, 30),
        (10, 10),
        (10.5, 30),
        (4_294_967_296, 4_294_967_297),
        (10, 4_294_967_296),
        (True, 30),
        (10, False),
    ]
    for start, end in cases:
        try:
            build_section_time_range(start, end)  # type: ignore[arg-type]
        except ValueError as error:
            assert "timeRange" in str(error)
        else:
            raise AssertionError(f"Expected ValueError for {start!r}..{end!r}")


def test_run_analysis_job_returns_success_envelope() -> None:
    """Ensure orchestration responses stay typed for valid requests."""
    success = run_analysis_job(
        "job-1",
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar"],
        },
        "2026-03-12T00:00:00Z",
    )

    assert success["state"] == "succeeded"
    assert success["progressLabel"] == "Analysis ready for Late Night Set"
    assert success["result"]["exportSummary"]["format"] == "cue-sheet"


def test_run_analysis_job_handles_validation_exception() -> None:
    """Ensure invalid job requests return the expected orchestration failure envelope."""
    failure = run_analysis_job("job-2", {"sourceKind": "demo"}, "2026-03-12T00:00:00Z")

    assert failure == {
        "jobId": "job-2",
        "state": "failed",
        "requestedAt": "2026-03-12T00:00:00Z",
        "updatedAt": "2026-03-12T00:00:00Z",
        "error": {
            "code": "invalid_request",
            "message": "Invalid analysis job request: invalid field 'sourceLabel'",
        },
    }


def test_run_analysis_job_returns_success_for_local_audio_request() -> None:
    """Ensure local-audio requests separate stems before building rehearsal roles."""
    with (
        patch("bandscope_analysis.api._run_stem_separation_with_timeout") as separator,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        separator.return_value = {
            "stems": {
                "vocals": np.zeros(1024),
                "bass": np.zeros(1024),
                "drums": np.zeros(1024),
                "other": np.zeros(1024),
            },
            "sample_rate": 22050,
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
            "separation_notes": "Separated selected local audio into 4 canonical stems.",
        }

        success = run_analysis_job(
            "job-3",
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "late-night-set.wav",
                "roleFocus": ["bass-guitar"],
                "localSource": {
                    "sourcePath": "/Users/test/Music/late-night-set.wav",
                    "fileName": "late-night-set.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024000,
                },
            },
            "2026-03-12T00:00:00Z",
        )

    assert success["state"] == "succeeded"
    assert success["progressLabel"] == "Analysis ready for late-night-set.wav"


def test_run_analysis_job_updates_report_progress_and_cache(tmp_path) -> None:
    """Ensure local-audio orchestration exposes stages and persists reusable cache."""
    payload = {
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

    with (
        patch("bandscope_analysis.api._run_stem_separation_with_timeout") as separator,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        separator.return_value = {
            "stems": {
                "vocals": np.zeros(1024),
                "bass": np.zeros(1024),
                "drums": np.zeros(1024),
                "other": np.zeros(1024),
            },
            "sample_rate": 22050,
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
                "drums": "instrument",
                "other": "instrument",
            },
            "separation_notes": "Separated selected local audio into 4 canonical stems.",
        }

        updates = list(run_analysis_job_updates("job-cache", payload, "2026-03-12T00:00:00Z"))

        observed_progress = [
            (update["state"], update["progressStage"], update["progressPercent"])
            for update in updates
        ]
        assert observed_progress == [
            ("running", "decode", 20),
            ("running", "separate", 45),
            ("running", "analyze", 70),
            ("running", "persist", 90),
            ("succeeded", "ready", 100),
        ]
        assert updates[-1]["cacheStatus"] == "stored"
        cache_files = list((tmp_path / "cache" / "analysis-cache-v1").glob("*.json"))
        assert len([path for path in cache_files if not path.name.endswith(".features.json")]) == 1
        assert len([path for path in cache_files if path.name.endswith(".features.json")]) == 1

        cached_updates = list(
            run_analysis_job_updates("job-cache-2", payload, "2026-03-12T00:00:00Z")
        )

    assert cached_updates[-1]["state"] == "succeeded"
    assert cached_updates[-1]["progressStage"] == "ready"
    assert cached_updates[-1]["progressPercent"] == 100
    assert cached_updates[-1]["cacheStatus"] == "hit"


def test_run_analysis_job_updates_fail_safely_when_local_separation_fails() -> None:
    """Ensure unsafe or undecodable local audio returns a typed failure envelope."""
    with (
        patch("bandscope_analysis.api._run_stem_separation_with_timeout") as separator,
        patch("bandscope_analysis.api.logger") as logger,
    ):
        separator.side_effect = ValueError(
            "Audio file is too large for stem separation: 16 bytes (max 8 bytes)"
        )

        updates = list(
            run_analysis_job_updates(
                "job-failed-stems",
                {
                    "sourceKind": "local_audio",
                    "projectId": "project-1",
                    "sourceLabel": "late-night-set.wav",
                    "roleFocus": ["bass-guitar"],
                    "localSource": {
                        "sourcePath": "/Users/test/Music/late-night-set.wav",
                        "fileName": "late-night-set.wav",
                        "extension": "wav",
                        "fileSizeBytes": 1024000,
                    },
                },
                "2026-03-12T00:00:00Z",
            )
        )

    assert [(update["state"], update.get("progressStage")) for update in updates] == [
        ("running", "decode"),
        ("running", "separate"),
        ("failed", "separate"),
    ]
    assert updates[-1]["progressPercent"] == 45
    assert updates[-1]["error"] == {
        "code": "engine_unavailable",
        "message": "Stem separation failed",
    }
    assert "/Users/test/Music" not in str(updates[-1]["error"])
    logger.error.assert_called_once_with(
        "Stem separation failed before analysis job completion. (%s)",
        "ValueError",
    )


def test_cached_analysis_helpers_treat_invalid_cache_as_miss(tmp_path) -> None:
    """Ensure malformed cache files degrade to cache misses without failing analysis."""
    cache_path = tmp_path / "analysis-cache.json"

    for content in (
        "[]",
        '{"schemaVersion": 999, "result": {}}',
        '{"schemaVersion": 1, "result": []}',
    ):
        cache_path.write_text(content, encoding="utf-8")
        assert _load_cached_analysis(cache_path) is None


def test_cached_analysis_store_handles_unsupported_requests_and_write_errors(tmp_path) -> None:
    """Ensure cache persistence failures do not block analysis results."""
    demo_request = validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar"],
        }
    )
    assert (
        _store_cached_analysis(
            tmp_path / "demo-cache.json",
            demo_request,
            build_demo_rehearsal_song(),
        )
        is False
    )

    local_request = validate_analysis_job_request(
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
        }
    )
    assert _store_cached_analysis(tmp_path, local_request, build_demo_rehearsal_song()) is False


def test_local_feature_cache_round_trip_uses_disk_cache_before_recompute(tmp_path) -> None:
    """Ensure reusable stem/features cache can be loaded on subsequent analyses."""
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
    metadata_path, arrays_path = _feature_cache_paths(request) or (None, None)
    assert metadata_path is not None
    assert arrays_path is not None

    features = {
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
    assert _store_cached_local_audio_features(metadata_path, arrays_path, request, features) is True

    loaded = _load_cached_local_audio_features(metadata_path, arrays_path)
    assert loaded is not None
    assert loaded["sr"] == 22050
    assert loaded["stems"]["bass"].shape == (256,)
    assert loaded["stem_role_types"] == {
        "vocals": "vocal",
        "bass": "instrument",
        "drums": "instrument",
        "other": "instrument",
    }

    with (
        patch(
            "bandscope_analysis.api._load_cached_analysis",
            return_value=None,
        ),
        patch(
            "bandscope_analysis.api._load_cached_local_audio_features",
            return_value=loaded,
        ),
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
        patch("bandscope_analysis.api._store_cached_local_audio_features") as store_features,
    ):
        updates = list(run_analysis_job_updates("job-feature-hit", request, "2026-03-12T00:00:00Z"))

    assert updates[1]["progressLabel"] == "Loaded reusable stems... (45%)"
    assert updates[1]["cacheStatus"] == "miss"
    assert updates[-1]["state"] == "succeeded"
    separator_class.return_value.separate.assert_not_called()
    store_features.assert_not_called()


def test_stem_work_arrays_path_requires_local_temp_root(tmp_path) -> None:
    """Ensure process handoff arrays stay under an app-provided temp root."""
    demo_request = validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar"],
        }
    )
    local_request = validate_analysis_job_request(
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
        }
    )
    local_request_with_temp = validate_analysis_job_request(
        {
            **local_request,
            "tempRoot": str(tmp_path / "temp"),
        }
    )

    assert _stem_work_arrays_path(demo_request) is None
    assert _stem_work_arrays_path(local_request) is None
    assert _stem_work_arrays_path(local_request_with_temp) is not None


def test_local_feature_cache_treats_malformed_metadata_as_miss(tmp_path) -> None:
    """Ensure malformed feature metadata never blocks a fresh analysis run."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    for content in (
        "[]",
        '{"schemaVersion": 999, "sampleRate": 22050, "separation": {}, "stemKeys": ["bass"]}',
        '{"schemaVersion": 1, "sampleRate": "22050", "separation": {}, "stemKeys": ["bass"]}',
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": [], "stemKeys": ["bass"]}',
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, "stemKeys": []}',
    ):
        metadata_path.write_text(content, encoding="utf-8")
        assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, "stemKeys": ["bass"]}',
        encoding="utf-8",
    )
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    np.savez_compressed(arrays_path, stem_vocals=np.zeros(4))
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, "stemKeys": ["bass"]}',
        encoding="utf-8",
    )
    arrays_path.write_bytes(b"not an npz archive")
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, "stemKeys": [7]}',
        encoding="utf-8",
    )
    np.savez_compressed(arrays_path, stem_bass=np.zeros(4))
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, '
        '"stemKeys": ["bass"], "stemRoleTypes": []}',
        encoding="utf-8",
    )
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, '
        '"stemKeys": ["bass"], "stemRoleTypes": {"bass": "percussion"}}',
        encoding="utf-8",
    )
    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    class BadArchive:
        def __enter__(self):
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def __contains__(self, _key: str) -> bool:
            return True

        def __getitem__(self, _key: str) -> object:
            return "not-an-array"

    metadata_path.write_text(
        '{"schemaVersion": 1, "sampleRate": 22050, "separation": {}, "stemKeys": ["bass"]}',
        encoding="utf-8",
    )
    with patch("bandscope_analysis.api.np.load", return_value=BadArchive()):
        assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_local_feature_cache_store_rejects_invalid_payloads(tmp_path) -> None:
    """Ensure feature cache writes require app-owned request metadata and arrays."""
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
        }
    )
    demo_request = validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar"],
        }
    )
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    assert _store_cached_local_audio_features(metadata_path, arrays_path, demo_request, {}) is False
    assert _store_cached_local_audio_features(metadata_path, arrays_path, request, {}) is False
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {"stems": {"bass": np.zeros(4)}, "sr": "22050", "separation": {}},
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {"stems": {"bass": np.zeros(4)}, "sr": 22050, "separation": []},
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {
                "stems": {"bass": np.zeros(4)},
                "sr": 22050,
                "stem_role_types": {"bass": "percussion"},
                "separation": {},
            },
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {"stems": {"": np.zeros(4)}, "sr": 22050, "separation": {}},
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {"stems": {"bad-stem": np.zeros(4)}, "sr": 22050, "separation": {}},
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            request,
            {"stems": {"bass": [0.0]}, "sr": 22050, "separation": {}},
        )
        is False
    )
    assert (
        _store_cached_local_audio_features(
            tmp_path / "missing" / "features.json",
            tmp_path,
            request,
            {"stems": {"bass": np.zeros(4)}, "sr": 22050, "separation": {}},
        )
        is False
    )


def test_stem_separation_worker_maps_safe_error_kinds() -> None:
    """Ensure child worker errors are converted to serializable parent messages."""

    class FakeQueue:
        def __init__(self) -> None:
            self.items: list[tuple[str, object]] = []

        def put(self, item: tuple[str, object]) -> None:
            self.items.append(item)

    cases = [
        (
            FileNotFoundError("missing /secret/audio.wav"),
            "file_not_found",
            "Audio source file not found.",
            "Stem separation failed because the source file was missing.",
        ),
        (
            ValueError("bad media /secret/audio.wav"),
            "value_error",
            "Invalid audio source data.",
            "Stem separation rejected invalid audio source data.",
        ),
        (
            ValueError(
                "Stem separation is not available on this platform (demucs/torch not installed)"
            ),
            "runtime_error",
            "Stem separation is unavailable on this platform.",
            "Stem separation unavailable because Demucs or torch is not installed.",
        ),
        (
            RuntimeError("oom /secret/audio.wav"),
            "runtime_error",
            "Runtime error occurred during stem separation.",
            "Stem separation failed with a runtime error.",
        ),
        (
            Exception("unexpected /secret/audio.wav"),
            "runtime_error",
            "An unexpected error occurred during stem separation.",
            "Stem separation failed unexpectedly.",
        ),
    ]

    for error, expected_kind, expected_message, expected_log_message in cases:
        fake_queue = FakeQueue()
        with (
            patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
            patch("bandscope_analysis.api.logger") as logger,
        ):
            separator_class.return_value.separate.side_effect = error
            _stem_separation_worker("/tmp/audio.wav", fake_queue)
        assert fake_queue.items == [(expected_kind, expected_message)]
        assert "/secret" not in str(fake_queue.items)
        logger.error.assert_called_once_with("%s (%s)", expected_log_message, type(error).__name__)

    fake_queue = FakeQueue()
    with patch("bandscope_analysis.api.AudioStemSeparator") as separator_class:
        separator_class.return_value.separate.return_value = {"ok": True}
        _stem_separation_worker("/tmp/audio.wav", fake_queue)
    assert fake_queue.items == [("ok", {"ok": True})]

    fake_queue = FakeQueue()
    with patch("bandscope_analysis.api.AudioStemSeparator") as separator_class:
        separator_class.return_value.separate.return_value = {"stems": {}}
        _stem_separation_worker("/tmp/audio.wav", fake_queue, "/tmp/stems.npz")
    assert fake_queue.items == [("runtime_error", "Runtime error occurred during stem separation.")]

    fake_queue = FakeQueue()
    with patch("bandscope_analysis.api.AudioStemSeparator") as separator_class:
        separator_class.return_value.separate.return_value = {
            "stems": {"bass": np.zeros(4)},
            "stem_role_types": {"bass": "percussion"},
        }
        _stem_separation_worker("/tmp/audio.wav", fake_queue, "/tmp/stems.npz")
    assert fake_queue.items == [("runtime_error", "Runtime error occurred during stem separation.")]


def test_stem_separation_worker_writes_large_stems_to_file_envelope(tmp_path) -> None:
    """Ensure worker handoff avoids queueing full stem arrays when a file path exists."""
    arrays_path = tmp_path / "stems.npz"

    class FakeQueue:
        def __init__(self) -> None:
            self.items: list[tuple[str, object]] = []

        def put(self, item: tuple[str, object]) -> None:
            self.items.append(item)

    fake_queue = FakeQueue()
    with patch("bandscope_analysis.api.AudioStemSeparator") as separator_class:
        separator_class.return_value.separate.return_value = {
            "stems": {
                "vocals": np.zeros(4),
                "bass": np.ones(4),
            },
            "sample_rate": 22050,
            "stem_role_types": {
                "vocals": "vocal",
                "bass": "instrument",
            },
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "separation_notes": "Separated test stems.",
        }
        _stem_separation_worker("/tmp/audio.wav", fake_queue, str(arrays_path))

    assert len(fake_queue.items) == 1
    kind, payload = fake_queue.items[0]
    assert kind == "ok_file"
    assert isinstance(payload, dict)
    assert payload["arraysPath"] == str(arrays_path)
    assert payload["stemKeys"] == ["vocals", "bass"]
    assert payload["stemRoleTypes"] == {"vocals": "vocal", "bass": "instrument"}
    assert "stems" not in payload
    with np.load(arrays_path, allow_pickle=False) as archive:
        assert archive["stem_bass"].shape == (4,)


def test_stem_separation_process_helper_maps_worker_results(tmp_path) -> None:
    """Ensure parent-side process helper maps worker result envelopes."""

    class FakeQueue:
        def __init__(self, item: tuple[str, object]) -> None:
            self.item = item

        def get(self, timeout: float) -> tuple[str, object]:
            assert timeout > 0
            return self.item

        def close(self) -> None:
            return None

        def join_thread(self) -> None:
            return None

    class FakeProcess:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            self.started = False

        def start(self) -> None:
            self.started = True

        def join(self, timeout: float | None = None) -> None:
            return None

        def is_alive(self) -> bool:
            return False

    class FakeContext:
        def __init__(self, item: tuple[str, object]) -> None:
            self.item = item
            self.Process = FakeProcess

        def Queue(self, maxsize: int) -> FakeQueue:
            assert maxsize == 1
            return FakeQueue(self.item)

    with patch(
        "bandscope_analysis.api._multiprocessing_context",
        return_value=FakeContext(("ok", {"stems": {}})),
    ):
        assert _run_stem_separation_with_timeout("/tmp/audio.wav") == {"stems": {}}

    arrays_path = tmp_path / "worker-stems.npz"
    np.savez_compressed(arrays_path, stem_bass=np.ones(4))
    file_payload = {
        "arraysPath": str(arrays_path),
        "sampleRate": 22050,
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
        "stemKeys": ["bass"],
        "stemRoleTypes": {"bass": "instrument"},
    }
    with patch(
        "bandscope_analysis.api._multiprocessing_context",
        return_value=FakeContext(("ok_file", file_payload)),
    ):
        loaded = _run_stem_separation_with_timeout("/tmp/audio.wav", arrays_path=arrays_path)
    assert loaded["sr"] == 22050
    assert loaded["stems"]["bass"].shape == (4,)
    assert loaded["stem_role_types"] == {"bass": "instrument"}
    assert not arrays_path.with_suffix(".json").exists()

    missing_parent_arrays = tmp_path / "missing-parent" / "worker-stems.npz"
    missing_arrays = tmp_path / "missing-arrays.npz"
    invalid_file_payloads = [
        ("not-a-dict", "Stem separation returned invalid metadata.", None),
        (
            {
                "arraysPath": str(missing_parent_arrays),
                "sampleRate": 22050,
                "separation": {},
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "instrument"},
            },
            "Stem separation returned invalid stem arrays.",
            missing_parent_arrays,
        ),
        (
            {
                "arraysPath": str(missing_arrays),
                "sampleRate": 22050,
                "separation": {},
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "instrument"},
            },
            "Stem separation returned invalid stem arrays.",
            missing_arrays,
        ),
    ]
    for payload, expected_message, authorized_path in invalid_file_payloads:
        with patch(
            "bandscope_analysis.api._multiprocessing_context",
            return_value=FakeContext(("ok_file", payload)),
        ):
            try:
                _run_stem_separation_with_timeout("/tmp/audio.wav", arrays_path=authorized_path)
            except RuntimeError as error:
                assert expected_message in str(error)
            else:
                raise AssertionError("Expected RuntimeError")

    error_cases = [
        (("file_not_found", "missing"), FileNotFoundError),
        (("value_error", "bad media"), ValueError),
        (("runtime_error", "oom"), RuntimeError),
    ]
    for item, expected_error in error_cases:
        with patch(
            "bandscope_analysis.api._multiprocessing_context",
            return_value=FakeContext(item),
        ):
            try:
                _run_stem_separation_with_timeout("/tmp/audio.wav")
            except expected_error as error:
                assert str(error)
            else:
                raise AssertionError(f"Expected {expected_error.__name__}")


def test_build_local_audio_features_preserves_file_envelope_stem_roles(tmp_path) -> None:
    """Ensure temp-file stem handoff returns the same feature schema as in-memory separation."""
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
            "tempRoot": str(tmp_path / "temp"),
        }
    )
    file_handoff_features = {
        "stems": {"bass": np.ones(4)},
        "sr": 22050,
        "stem_role_types": {"bass": "instrument"},
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
    }

    with patch(
        "bandscope_analysis.api._run_stem_separation_with_timeout",
        return_value=file_handoff_features,
    ) as run_stem_separation:
        loaded = _build_local_audio_features(request)

    assert loaded == file_handoff_features
    assert run_stem_separation.call_args.kwargs["arrays_path"] == _stem_work_arrays_path(request)

    legacy_file_handoff_features = {
        "stems": {"vocals": np.ones(4)},
        "sr": 22050,
        "separation": {"duration_seconds": 1.0, "chunk_count": 1, "notes": "ok"},
    }
    with patch(
        "bandscope_analysis.api._run_stem_separation_with_timeout",
        return_value=legacy_file_handoff_features,
    ):
        loaded_legacy = _build_local_audio_features(request)

    assert loaded_legacy == {
        **legacy_file_handoff_features,
        "stem_role_types": {"vocals": "vocal"},
    }


def test_stem_separation_process_helper_handles_empty_worker_exit() -> None:
    """Ensure a worker that exits without a result degrades safely."""

    class EmptyQueue:
        def get(self, timeout: float) -> tuple[str, object]:
            raise queue.Empty

        def close(self) -> None:
            return None

        def join_thread(self) -> None:
            return None

    class EmptyProcess:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            return None

        def start(self) -> None:
            return None

        def is_alive(self) -> bool:
            return False

        def join(self, timeout: float | None = None) -> None:
            return None

    class EmptyContext:
        Process = EmptyProcess

        def Queue(self, maxsize: int) -> EmptyQueue:
            assert maxsize == 1
            return EmptyQueue()

    with patch("bandscope_analysis.api._multiprocessing_context", return_value=EmptyContext()):
        try:
            _run_stem_separation_with_timeout("/tmp/audio.wav")
        except RuntimeError as error:
            assert "ended without a result" in str(error)
        else:
            raise AssertionError("Expected RuntimeError")


def test_stop_process_kills_stubborn_worker() -> None:
    """Ensure stubborn timed-out workers are killed after terminate."""

    class StubbornProcess:
        def __init__(self) -> None:
            self.terminated = False
            self.killed = False

        def is_alive(self) -> bool:
            return not self.killed

        def terminate(self) -> None:
            self.terminated = True

        def kill(self) -> None:
            self.killed = True

        def join(self, timeout: float | None = None) -> None:
            return None

    process = StubbornProcess()
    _stop_process(process)  # type: ignore[arg-type]
    assert process.terminated is True
    assert process.killed is True


def test_run_analysis_job_updates_degrades_when_stem_step_is_unavailable() -> None:
    """Ensure runtime ML failures continue with fallback cues."""
    with patch(
        "bandscope_analysis.api._build_local_audio_features",
        side_effect=RuntimeError("oom"),
    ):
        updates = list(
            run_analysis_job_updates(
                "job-runtime",
                {
                    "sourceKind": "local_audio",
                    "projectId": "project-1",
                    "sourceLabel": "late-night-set.wav",
                    "roleFocus": ["bass-guitar"],
                    "localSource": {
                        "sourcePath": "/Users/test/Music/late-night-set.wav",
                        "fileName": "late-night-set.wav",
                        "extension": "wav",
                        "fileSizeBytes": 1024000,
                    },
                },
                "2026-03-12T00:00:00Z",
            )
        )

    assert updates[-1]["state"] == "succeeded"
    assert any(
        update.get("progressLabel") == "Stem separation unavailable; continuing with fallback cues"
        for update in updates
    )


def test_run_analysis_job_updates_gracefully_degrades_when_stem_step_times_out() -> None:
    """Ensure timed-out ML stem inference continues with fallback cues instead of hard failure."""

    def _slow_separate(_source_path: str) -> dict[str, object]:
        time.sleep(0.4)
        return {
            "stems": {
                "vocals": np.zeros(1024),
                "bass": np.zeros(1024),
                "drums": np.zeros(1024),
                "other": np.zeros(1024),
            },
            "sample_rate": 22050,
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "separation_notes": "Separated selected local audio into 4 canonical stems.",
        }

    with (
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.api.STEM_SEPARATION_TIMEOUT_SECONDS", 0.001),
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        separator_class.return_value.separate.side_effect = _slow_separate

        started_at = time.monotonic()
        updates = list(
            run_analysis_job_updates(
                "job-timeout",
                {
                    "sourceKind": "local_audio",
                    "projectId": "project-1",
                    "sourceLabel": "late-night-set.wav",
                    "roleFocus": ["bass-guitar"],
                    "localSource": {
                        "sourcePath": "/Users/test/Music/late-night-set.wav",
                        "fileName": "late-night-set.wav",
                        "extension": "wav",
                        "fileSizeBytes": 1024000,
                    },
                },
                "2026-03-12T00:00:00Z",
            )
        )
        elapsed = time.monotonic() - started_at

    assert updates[-1]["state"] == "succeeded"
    assert elapsed < 0.4
    assert any(
        update.get("progressLabel") == "Stem separation timed out; continuing with fallback cues"
        for update in updates
    )
