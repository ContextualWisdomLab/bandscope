"""Tests for the public analysis-engine API helpers."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    _load_cached_analysis,
    _store_cached_analysis,
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
    ]

    for payload, message in cases:
        try:
            validate_analysis_job_request(payload)
        except ValueError as error:
            assert message in str(error)
        else:
            raise AssertionError(f"Expected ValueError for {payload!r}")


def test_build_demo_rehearsal_song_matches_expected_fixture() -> None:
    """Ensure the bootstrap demo result is present and player-relevant."""
    song = build_demo_rehearsal_song()

    assert song["title"] == "Late Night Set"
    assert song["sections"][0]["timeRange"] == {"start": 10, "end": 30}
    assert song["sections"][0]["roles"][0]["id"] == "bass-guitar"
    assert song["sections"][0]["roles"][4]["manualOverrides"][0]["value"]["source"] == "user"


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
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        separator = separator_class.return_value
        separator.separate.return_value = {
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
    separator.separate.assert_called_once_with("/Users/test/Music/late-night-set.wav")


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
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        separator = separator_class.return_value
        separator.separate.return_value = {
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
        assert len(list((tmp_path / "cache" / "analysis-cache-v1").glob("*.json"))) == 1

        cached_updates = list(
            run_analysis_job_updates("job-cache-2", payload, "2026-03-12T00:00:00Z")
        )

    assert cached_updates[-1]["state"] == "succeeded"
    assert cached_updates[-1]["progressStage"] == "ready"
    assert cached_updates[-1]["progressPercent"] == 100
    assert cached_updates[-1]["cacheStatus"] == "hit"
    separator.separate.assert_called_once_with("/Users/test/Music/late-night-set.wav")


def test_run_analysis_job_updates_fail_safely_when_local_separation_fails() -> None:
    """Ensure unsafe or undecodable local audio returns a typed failure envelope."""
    with patch("bandscope_analysis.api.AudioStemSeparator") as separator_class:
        separator_class.return_value.separate.side_effect = ValueError(
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
        "message": (
            "Stem separation failed: Audio file is too large for stem separation: "
            "16 bytes (max 8 bytes)"
        ),
    }


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
