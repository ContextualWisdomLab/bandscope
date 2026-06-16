"""Tests for the public analysis-engine API helpers."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    _feature_cache_path,
    _load_cached_analysis,
    _load_cached_features,
    _MlStepTimeout,
    _run_ml_step_with_timeout,
    _store_cached_analysis,
    _store_cached_features,
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
            "separation_notes": "Separated selected local audio into 4 canonical stems.",
        }

        updates = list(run_analysis_job_updates("job-cache", payload, "2026-03-12T00:00:00Z"))

        observed_progress = [
            (update["state"], update["progressStage"], update["progressPercent"])
            for update in updates
        ]
        assert observed_progress == [
            ("running", "decode", 10),
            ("running", "separate", 25),
            ("running", "separate", 45),
            ("running", "analyze", 55),
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
    with (
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.api.time.sleep"),
    ):
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
    assert updates[-1]["progressPercent"] == 25
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


def test_run_ml_step_with_timeout_retries_on_failure() -> None:
    """Ensure the ML step runner retries transient failures before giving up."""
    call_count = 0

    def flaky_step(path: str) -> dict:
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise ValueError("Transient failure")
        return {"result": "success"}

    with patch("bandscope_analysis.api.time.sleep"):
        result = _run_ml_step_with_timeout(
            flaky_step,
            "/path/to/audio.wav",
            timeout_seconds=10,
            max_retries=2,
            step_label="Test step",
        )

    assert result == {"result": "success"}
    assert call_count == 2


def test_run_ml_step_with_timeout_raises_after_exhausting_retries() -> None:
    """Ensure the runner raises after all retries are exhausted."""
    import pytest

    def always_fails(path: str) -> dict:
        raise OSError("Permanent failure")

    with (
        patch("bandscope_analysis.api.time.sleep"),
        pytest.raises(OSError, match="Permanent failure"),
    ):
        _run_ml_step_with_timeout(
            always_fails,
            "/path/to/audio.wav",
            timeout_seconds=10,
            max_retries=2,
            step_label="Failing step",
        )


def test_run_ml_step_with_timeout_handles_timeout() -> None:
    """Ensure the runner raises MlStepTimeout when SIGALRM fires."""
    import signal as sig

    import pytest

    if not hasattr(sig, "SIGALRM"):
        pytest.skip("SIGALRM not available on this platform")

    def slow_step(path: str) -> dict:
        import time as real_time

        real_time.sleep(10)
        return {"result": "should not reach"}

    with pytest.raises(_MlStepTimeout):
        _run_ml_step_with_timeout(
            slow_step,
            "/path/to/audio.wav",
            timeout_seconds=1,
            max_retries=1,
            step_label="Slow step",
        )


def test_feature_cache_path_returns_none_for_non_local_requests() -> None:
    """Ensure feature cache path is None for demo requests."""
    result = _feature_cache_path(
        validate_analysis_job_request(
            {
                "sourceKind": "demo",
                "sourceLabel": "Late Night Set",
                "roleFocus": ["bass-guitar"],
            }
        )
    )
    assert result is None


def test_feature_cache_path_returns_path_for_local_audio_with_cache_root(tmp_path) -> None:
    """Ensure feature cache path is generated for local audio requests."""
    result = _feature_cache_path(
        validate_analysis_job_request(
            {
                "sourceKind": "local_audio",
                "projectId": "project-1",
                "sourceLabel": "test.wav",
                "roleFocus": [],
                "localSource": {
                    "sourcePath": "/path/to/test.wav",
                    "fileName": "test.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024,
                },
                "cacheRoot": str(tmp_path),
            }
        )
    )
    assert result is not None
    assert "feature-cache-v1" in str(result)


def test_load_cached_features_treats_invalid_cache_as_miss(tmp_path) -> None:
    """Ensure malformed feature cache files degrade to misses."""
    cache_path = tmp_path / "features.json"

    for content in (
        "[]",
        '{"schemaVersion": 999, "features": {}}',
        '{"schemaVersion": 1, "features": []}',
        '{"schemaVersion": 1}',
    ):
        cache_path.write_text(content, encoding="utf-8")
        assert _load_cached_features(cache_path) is None

    # Non-existent file
    assert _load_cached_features(tmp_path / "nonexistent.json") is None


def test_load_cached_features_returns_valid_features(tmp_path) -> None:
    """Ensure valid feature cache is loaded correctly."""
    import json

    cache_path = tmp_path / "features.json"
    payload = {
        "schemaVersion": 1,
        "source": {"fileName": "test.wav", "extension": "wav", "fileSizeBytes": 1024},
        "features": {"sr": 22050, "separation": {"duration_seconds": 1.0}},
    }
    cache_path.write_text(json.dumps(payload), encoding="utf-8")
    result = _load_cached_features(cache_path)
    assert result is not None
    assert result["sr"] == 22050


def test_store_cached_features_persists_to_disk(tmp_path) -> None:
    """Ensure feature caching writes to disk correctly."""
    import json

    cache_path = tmp_path / "feature-cache-v1" / "test.json"
    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-1",
            "sourceLabel": "test.wav",
            "roleFocus": [],
            "localSource": {
                "sourcePath": "/path/to/test.wav",
                "fileName": "test.wav",
                "extension": "wav",
                "fileSizeBytes": 1024,
            },
            "cacheRoot": str(tmp_path),
        }
    )
    features = {"sr": 22050, "separation": {"duration_seconds": 1.0}}
    assert _store_cached_features(cache_path, request, features) is True
    assert cache_path.exists()

    stored = json.loads(cache_path.read_text(encoding="utf-8"))
    assert stored["schemaVersion"] == 1
    assert stored["features"]["sr"] == 22050


def test_store_cached_features_rejects_requests_without_local_source(tmp_path) -> None:
    """Ensure storing features fails gracefully without localSource."""
    cache_path = tmp_path / "features.json"
    request = validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": [],
        }
    )
    assert _store_cached_features(cache_path, request, {"sr": 22050}) is False


def test_store_cached_features_handles_write_errors(tmp_path) -> None:
    """Ensure feature cache write failures return False without raising."""
    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-1",
            "sourceLabel": "test.wav",
            "roleFocus": [],
            "localSource": {
                "sourcePath": "/path/to/test.wav",
                "fileName": "test.wav",
                "extension": "wav",
                "fileSizeBytes": 1024,
            },
            "cacheRoot": str(tmp_path),
        }
    )
    # tmp_path itself (directory) will cause an OSError for path.open()
    assert _store_cached_features(tmp_path, request, {"sr": 22050}) is False


def test_run_analysis_job_updates_uses_cached_features_when_available(tmp_path) -> None:
    """Ensure intermediate feature cache is loaded when stems exist on disk."""
    import json

    payload = {
        "sourceKind": "local_audio",
        "projectId": "project-features",
        "sourceLabel": "test.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/Users/test/Music/test.wav",
            "fileName": "test.wav",
            "extension": "wav",
            "fileSizeBytes": 1024,
        },
        "cacheRoot": str(tmp_path / "cache"),
        "tempRoot": str(tmp_path / "temp"),
    }

    # Pre-populate the feature cache
    feature_path = _feature_cache_path(validate_analysis_job_request(payload))
    assert feature_path is not None
    feature_path.parent.mkdir(parents=True, exist_ok=True)
    feature_payload = {
        "schemaVersion": 1,
        "source": {"fileName": "test.wav", "extension": "wav", "fileSizeBytes": 1024},
        "features": {"sr": 22050, "separation": {"duration_seconds": 1.0}},
    }
    feature_path.write_text(json.dumps(feature_payload), encoding="utf-8")

    with (
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        updates = list(
            run_analysis_job_updates("job-features-cached", payload, "2026-03-12T00:00:00Z")
        )
        # Separator should not be called since we have cached features
        separator_class.return_value.separate.assert_not_called()

    assert updates[-1]["state"] == "succeeded"
    # Verify the "Loading cached stems and features" step is present
    labels = [u["progressLabel"] for u in updates]
    assert "Loading cached stems and features" in labels


def test_run_analysis_job_updates_reports_timeout_failure() -> None:
    """Ensure timeout during stem separation yields a typed failure envelope."""
    with (
        patch("bandscope_analysis.api.AudioStemSeparator") as separator_class,
        patch("bandscope_analysis.api.time.sleep"),
    ):
        separator_class.return_value.separate.side_effect = _MlStepTimeout(
            "Stem separation timed out after 120s (attempt 2/2)"
        )

        updates = list(
            run_analysis_job_updates(
                "job-timeout",
                {
                    "sourceKind": "local_audio",
                    "projectId": "project-1",
                    "sourceLabel": "test.wav",
                    "roleFocus": [],
                    "localSource": {
                        "sourcePath": "/path/to/test.wav",
                        "fileName": "test.wav",
                        "extension": "wav",
                        "fileSizeBytes": 1024,
                    },
                },
                "2026-03-12T00:00:00Z",
            )
        )

    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"]["code"] == "engine_unavailable"
    assert "timed out" in updates[-1]["error"]["message"]
