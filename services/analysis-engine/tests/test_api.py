"""Tests for the public analysis-engine API helpers."""

from bandscope_analysis.api import (
    build_demo_rehearsal_song,
    get_analysis_status,
    run_analysis_job,
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
    assert song["sections"][0]["roles"][0]["id"] == "bass-guitar"
    assert song["sections"][0]["roles"][3]["manualOverrides"][0]["value"]["source"] == "user"


def test_run_analysis_job_returns_success_and_failure_envelopes() -> None:
    """Ensure orchestration responses stay typed for both valid and invalid requests."""
    success = run_analysis_job(
        "job-1",
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": ["bass-guitar"],
        },
        "2026-03-12T00:00:00Z",
    )
    failure = run_analysis_job("job-2", {"sourceKind": "demo"}, "2026-03-12T00:00:00Z")

    assert success["state"] == "succeeded"
    assert success["progressLabel"] == "Analysis ready for Late Night Set"
    assert success["result"]["exportSummary"]["format"] == "cue-sheet"
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
    """Ensure local-audio requests reuse the bootstrap success envelope."""
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
