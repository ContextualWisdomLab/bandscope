"""Integrity and crash-ordering contracts for reusable local-audio feature caches."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import (
    FEATURE_CACHE_SCHEMA_VERSION,
    _load_cached_local_audio_features,
    _store_cached_local_audio_features,
    validate_analysis_job_request,
)


def _request(tmp_path: Path):
    return validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "feature-cache-integrity",
            "sourceLabel": "rehearsal.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": "/app-owned/project/source.wav",
                "fileName": "rehearsal.wav",
                "extension": "wav",
                "fileSizeBytes": 4096,
            },
            "cacheRoot": str(tmp_path / "cache"),
            "tempRoot": str(tmp_path / "temp"),
        }
    )


def _features() -> dict[str, object]:
    return {
        "stems": {
            "vocals": np.arange(16, dtype=np.float32),
            "bass": np.arange(16, dtype=np.float32) * 0.5,
        },
        "sr": 22050,
        "stem_role_types": {"vocals": "vocal", "bass": "instrument"},
        "separation": {
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "notes": "Two admitted stems.",
        },
    }


def _identity(content_sha256: str = "a" * 64) -> dict[str, object]:
    return {
        "fileSizeBytes": 4096,
        "contentSha256": content_sha256,
        "analysisGeneration": 1,
    }


def test_feature_cache_manifest_binds_native_source_and_exact_arrays_bytes(
    tmp_path: Path,
) -> None:
    """A reusable feature manifest must bind native source evidence and exact NPZ bytes."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    admitted_identity = _identity()

    with patch(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        return_value=admitted_identity,
    ):
        assert (
            _store_cached_local_audio_features(
                metadata_path,
                arrays_path,
                _request(tmp_path),
                _features(),
            )
            is True
        )

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert metadata["schemaVersion"] == FEATURE_CACHE_SCHEMA_VERSION
    assert metadata["source"]["admittedAudio"] == admitted_identity
    assert metadata["arraysSha256"] == hashlib.sha256(arrays_path.read_bytes()).hexdigest()


def test_feature_cache_rejects_swapped_arrays_even_when_npz_shape_is_valid(tmp_path: Path) -> None:
    """A valid-looking NPZ cannot be substituted underneath an already-published manifest."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    with patch(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        return_value=_identity(),
    ):
        assert _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            _request(tmp_path),
            _features(),
        )

    np.savez_compressed(
        arrays_path,
        stem_vocals=np.ones(16, dtype=np.float32),
        stem_bass=np.ones(16, dtype=np.float32),
    )

    with patch(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        return_value=_identity(),
    ):
        assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_rejects_native_source_identity_change(tmp_path: Path) -> None:
    """Invalidate derived stems when source bytes change despite a stable path and size."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    with patch(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        return_value=_identity("a" * 64),
    ):
        assert _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            _request(tmp_path),
            _features(),
        )

    with patch(
        "bandscope_analysis.api.admitted_audio_cache_identity",
        return_value=_identity("b" * 64),
    ):
        assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_publishes_durable_arrays_before_manifest(tmp_path: Path) -> None:
    """Publish the manifest only after the exact array payload is durably available."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    events: list[str] = []

    def publish_arrays(stage: Path, destination: Path) -> None:
        assert destination == arrays_path
        assert stage.exists()
        destination.write_bytes(stage.read_bytes())
        stage.unlink()
        events.append("arrays")

    def publish_manifest(path: Path, payload: object) -> None:
        assert path == metadata_path
        assert events == ["arrays"]
        path.write_text(json.dumps(payload), encoding="utf-8")
        events.append("manifest")

    with (
        patch(
            "bandscope_analysis.api.admitted_audio_cache_identity",
            return_value=_identity(),
        ),
        patch("bandscope_analysis.api.publish_synced_cache_stage", publish_arrays, create=True),
        patch("bandscope_analysis.api.store_durable_cache_payload", publish_manifest),
    ):
        assert _store_cached_local_audio_features(
            metadata_path,
            arrays_path,
            _request(tmp_path),
            _features(),
        )

    assert events == ["arrays", "manifest"]


def test_feature_cache_fails_closed_before_manifest_when_array_publication_fails(
    tmp_path: Path,
) -> None:
    """A failed durable NPZ publication must not advertise a reusable manifest."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"

    with (
        patch(
            "bandscope_analysis.api.admitted_audio_cache_identity",
            return_value=_identity(),
        ),
        patch(
            "bandscope_analysis.api.publish_synced_cache_stage",
            side_effect=OSError("array publication failed"),
            create=True,
        ),
    ):
        assert (
            _store_cached_local_audio_features(
                metadata_path,
                arrays_path,
                _request(tmp_path),
                _features(),
            )
            is False
        )

    assert not metadata_path.exists()


def test_feature_cache_schema_advances_for_integrity_manifest() -> None:
    """Old feature manifests are not silently reinterpreted under the stronger contract."""
    assert FEATURE_CACHE_SCHEMA_VERSION >= 2
