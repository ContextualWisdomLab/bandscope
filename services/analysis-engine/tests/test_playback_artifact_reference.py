"""Path-free status projection contract for playable stem artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from bandscope_analysis.separation import (
    build_playable_stem_artifact_set_reference,
    materialize_playable_stem_artifact_set,
)


ARTIFACT_SET_ID = "b" * 64


def _contains_native_path(value: object) -> bool:
    """Return whether a nested status value contains a native path field."""
    if isinstance(value, dict):
        return any(
            "path" in str(field_name).lower() or _contains_native_path(field_value)
            for field_name, field_value in value.items()
        )
    if isinstance(value, list):
        return any(_contains_native_path(item_value) for item_value in value)
    return False


def test_reference_projection_removes_every_native_path(tmp_path: Path) -> None:
    """The status projection is safe to send across the Python-to-native boundary."""
    sample_axis = np.linspace(-0.5, 0.5, 32, dtype=np.float32)
    native_artifact_set = materialize_playable_stem_artifact_set(
        stem_arrays={
            "vocals": sample_axis,
            "bass": sample_axis * np.float32(0.5),
            "drums": sample_axis * np.float32(0.25),
            "other": sample_axis * np.float32(0.125),
        },
        sample_rate_hz=16_000,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )

    artifact_reference = build_playable_stem_artifact_set_reference(native_artifact_set)

    assert artifact_reference == {
        "artifactSetId": ARTIFACT_SET_ID,
        "formatVersion": 1,
        "sampleRate": 16_000,
        "channelCount": 1,
        "sampleCount": 32,
        "durationSeconds": 32 / 16_000,
        "appliedGain": 1.0,
        "stemArtifacts": [
            {
                "artifactId": f"stem-{stem_kind}",
                "stemKind": stem_kind,
                "fileSizeBytes": native_artifact_set["stemArtifacts"][artifact_index][
                    "fileSizeBytes"
                ],
                "contentHashSha256": native_artifact_set["stemArtifacts"][artifact_index][
                    "contentHashSha256"
                ],
                "mediaType": "audio/wav",
                "sampleRate": 16_000,
                "channelCount": 1,
                "sampleCount": 32,
                "durationSeconds": 32 / 16_000,
            }
            for artifact_index, stem_kind in enumerate(("vocals", "bass", "drums", "other"))
        ],
    }
    assert not _contains_native_path(artifact_reference)


def test_reference_projection_is_detached_from_native_manifest(tmp_path: Path) -> None:
    """Mutating trusted native metadata cannot alter an already-projected status value."""
    sample_axis = np.zeros(8, dtype=np.float32)
    native_artifact_set = materialize_playable_stem_artifact_set(
        stem_arrays={stem_kind: sample_axis for stem_kind in ("vocals", "bass", "drums", "other")},
        sample_rate_hz=8_000,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )
    artifact_reference = build_playable_stem_artifact_set_reference(native_artifact_set)

    native_artifact_set["artifactSetId"] = "c" * 64
    native_artifact_set["stemArtifacts"][0]["artifactId"] = "changed"
    native_artifact_set["stemArtifacts"].reverse()

    assert artifact_reference["artifactSetId"] == ARTIFACT_SET_ID
    assert [
        stem_artifact["stemKind"] for stem_artifact in artifact_reference["stemArtifacts"]
    ] == ["vocals", "bass", "drums", "other"]
    assert artifact_reference["stemArtifacts"][0]["artifactId"] == "stem-vocals"


def test_reference_projection_preserves_json_scalar_types(tmp_path: Path) -> None:
    """The projection contains only dictionaries, lists, strings, integers, and floats."""
    sample_axis = np.zeros(8, dtype=np.float32)
    native_artifact_set = materialize_playable_stem_artifact_set(
        stem_arrays={stem_kind: sample_axis for stem_kind in ("vocals", "bass", "drums", "other")},
        sample_rate_hz=8_000,
        artifact_root=tmp_path,
        artifact_set_id=ARTIFACT_SET_ID,
    )
    artifact_reference = build_playable_stem_artifact_set_reference(native_artifact_set)

    def assert_json_value(value: Any) -> None:
        """Recursively require the bounded JSON value family used by status emission."""
        if isinstance(value, dict):
            assert all(isinstance(field_name, str) for field_name in value)
            for field_value in value.values():
                assert_json_value(field_value)
            return
        if isinstance(value, list):
            for item_value in value:
                assert_json_value(item_value)
            return
        assert isinstance(value, (str, int, float)) and not isinstance(value, bool)

    assert_json_value(artifact_reference)
