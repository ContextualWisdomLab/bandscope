"""Analysis-status integration contract for path-free playable stem artifacts."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    _materialize_playable_stem_artifact_reference,
    run_analysis_job_updates,
    validate_analysis_job_request,
)


def _local_request(tmp_path: Path, *, cache_enabled: bool = False) -> dict[str, object]:
    """Return one validated local-audio request rooted in the test workspace."""
    request: dict[str, object] = {
        "sourceKind": "local_audio",
        "projectId": "project-playable-stems",
        "sourceLabel": "rights-cleared.wav",
        "roleFocus": ["bass-guitar"],
        "localSource": {
            "sourcePath": str(tmp_path / "rights-cleared.wav"),
            "fileName": "rights-cleared.wav",
            "extension": "wav",
            "fileSizeBytes": 4096,
        },
        "tempRoot": str(tmp_path / "temp"),
    }
    if cache_enabled:
        request["cacheRoot"] = str(tmp_path / "cache")
    return validate_analysis_job_request(request)


def _audio_features() -> dict[str, object]:
    """Return four aligned canonical sources without running a separation model."""
    sample_axis = np.linspace(-0.5, 0.5, 64, dtype=np.float32)
    return {
        "stems": {
            "vocals": sample_axis,
            "bass": sample_axis * np.float32(0.5),
            "drums": sample_axis * np.float32(0.25),
            "other": sample_axis * np.float32(0.125),
        },
        "sr": 8_000,
        "stem_role_types": {
            "vocals": "vocal",
            "bass": "instrument",
            "drums": "instrument",
            "other": "instrument",
        },
        "separation": {
            "duration_seconds": 64 / 8_000,
            "chunk_count": 1,
            "notes": "Rights-cleared deterministic fixture.",
        },
    }


def _minimal_song() -> dict[str, object]:
    """Return a bounded rehearsal result so tests isolate artifact status behavior."""
    return {
        "id": "analyzed-song",
        "title": "Rights-cleared fixture",
        "sections": [
            {
                "id": "verse-1",
                "label": "verse",
                "groove": "Straight eighths",
                "timeRange": {"start": 0, "end": 1},
                "confidence": {
                    "level": "high",
                    "source": "fixture",
                    "notes": "Deterministic test result.",
                },
                "roles": [],
                "partGraph": [],
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Check the first section.",
            "focusSections": ["verse"],
        },
    }


def _assert_no_path_key(value: object) -> None:
    """Reject a nested status value that contains any path-bearing field name."""
    if isinstance(value, dict):
        for field_name, field_value in value.items():
            assert "path" not in str(field_name).lower()
            _assert_no_path_key(field_value)
    elif isinstance(value, list):
        for item_value in value:
            _assert_no_path_key(item_value)


def test_materialize_reference_uses_request_owned_temp_root(tmp_path: Path) -> None:
    """Artifact identity and location derive from the validated analysis request."""
    request = _local_request(tmp_path)
    artifact_reference = _materialize_playable_stem_artifact_reference(
        request,
        _audio_features(),
    )

    assert artifact_reference is not None
    assert len(artifact_reference["artifactSetId"]) == 64
    assert artifact_reference["formatVersion"] == 1
    assert [
        stem_artifact["stemKind"] for stem_artifact in artifact_reference["stemArtifacts"]
    ] == ["vocals", "bass", "drums", "other"]
    artifact_directory = (
        tmp_path
        / "temp"
        / "playable-stems-v1"
        / artifact_reference["artifactSetId"]
    )
    assert sorted(artifact_path.name for artifact_path in artifact_directory.iterdir()) == [
        "bass.wav",
        "drums.wav",
        "other.wav",
        "vocals.wav",
    ]
    _assert_no_path_key(artifact_reference)
    json.dumps(artifact_reference)


def test_materialize_reference_omits_inapplicable_or_malformed_features(
    tmp_path: Path,
) -> None:
    """Only local requests with temp authority and complete sources produce references."""
    demo_request = validate_analysis_job_request(
        {
            "sourceKind": "demo",
            "sourceLabel": "Late Night Set",
            "roleFocus": [],
        }
    )
    request_without_temp = _local_request(tmp_path)
    request_without_temp.pop("tempRoot")
    invalid_features = _audio_features()
    invalid_features["stems"] = {"bass": np.zeros(4, dtype=np.float32)}

    assert _materialize_playable_stem_artifact_reference(demo_request, _audio_features()) is None
    assert (
        _materialize_playable_stem_artifact_reference(
            request_without_temp,
            _audio_features(),
        )
        is None
    )
    with patch("bandscope_analysis.api.logger") as logger:
        assert (
            _materialize_playable_stem_artifact_reference(
                _local_request(tmp_path),
                invalid_features,
            )
            is None
        )
    logger.warning.assert_called_once_with(
        "Playable stem artifact publication failed; stems remain unavailable."
    )


def test_success_status_includes_path_free_artifact_reference(tmp_path: Path) -> None:
    """Fresh separation attaches playable-source evidence only to terminal status."""
    request = _local_request(tmp_path)
    with (
        patch("bandscope_analysis.api._build_local_audio_features", return_value=_audio_features()),
        patch("bandscope_analysis.api.build_demo_rehearsal_song", return_value=_minimal_song()),
    ):
        updates = run_analysis_job_updates("job-playable", request, "2026-09-04T00:00:00Z")

    assert all("playableStemArtifactSet" not in update for update in updates[:-1])
    final_status = updates[-1]
    assert final_status["state"] == "succeeded"
    artifact_reference = final_status["playableStemArtifactSet"]
    assert artifact_reference["artifactSetId"]
    _assert_no_path_key(artifact_reference)


def test_artifact_publication_failure_does_not_fabricate_or_fail_analysis(
    tmp_path: Path,
) -> None:
    """A media-publication failure preserves analysis and omits stem availability."""
    request = _local_request(tmp_path)
    with (
        patch("bandscope_analysis.api._build_local_audio_features", return_value=_audio_features()),
        patch("bandscope_analysis.api.build_demo_rehearsal_song", return_value=_minimal_song()),
        patch(
            "bandscope_analysis.api.materialize_playable_stem_artifact_set",
            side_effect=ValueError("payload-controlled detail"),
        ),
        patch("bandscope_analysis.api.logger") as logger,
    ):
        final_status = run_analysis_job_updates(
            "job-unavailable",
            request,
            "2026-09-04T00:00:00Z",
        )[-1]

    assert final_status["state"] == "succeeded"
    assert "playableStemArtifactSet" not in final_status
    logger.warning.assert_called_once_with(
        "Playable stem artifact publication failed; stems remain unavailable."
    )
    assert "payload-controlled" not in str(logger.mock_calls)


def test_final_result_cache_hit_rebuilds_artifacts_from_feature_cache(tmp_path: Path) -> None:
    """Cached analysis can restore stem playback without invoking separation again."""
    request = _local_request(tmp_path, cache_enabled=True)
    with (
        patch("bandscope_analysis.api._build_local_audio_features", return_value=_audio_features()),
        patch("bandscope_analysis.api.build_demo_rehearsal_song", return_value=_minimal_song()),
    ):
        first_status = run_analysis_job_updates(
            "job-first",
            request,
            "2026-09-04T00:00:00Z",
        )[-1]
    first_reference = first_status["playableStemArtifactSet"]
    shutil.rmtree(tmp_path / "temp" / "playable-stems-v1")

    with patch("bandscope_analysis.api._build_local_audio_features") as separator:
        cached_updates = run_analysis_job_updates(
            "job-cached",
            request,
            "2026-09-04T00:01:00Z",
        )

    separator.assert_not_called()
    cached_status = cached_updates[-1]
    assert cached_status["cacheStatus"] == "hit"
    assert cached_status["playableStemArtifactSet"] == first_reference
    rebuilt_directory = (
        tmp_path
        / "temp"
        / "playable-stems-v1"
        / first_reference["artifactSetId"]
    )
    assert rebuilt_directory.is_dir()
