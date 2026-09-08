"""Regression tests for persisted stem-role semantic admission."""

import json

import numpy as np

from bandscope_analysis.api import _load_cached_local_audio_features
from bandscope_analysis.feature_cache_admission import _has_canonical_stem_role_metadata


def test_feature_cache_rejects_role_type_that_contradicts_canonical_stem_semantics(
    tmp_path,
) -> None:
    """A persisted instrument stem cannot be replayed as vocal rehearsal evidence."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"
    np.savez_compressed(arrays_path, stem_bass=np.zeros(4, dtype=np.float32))

    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": 22050,
                "separation": {},
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "vocal"},
            }
        ),
        encoding="utf-8",
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": 22050,
                "separation": {},
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "instrument"},
            }
        ),
        encoding="utf-8",
    )

    replayed = _load_cached_local_audio_features(metadata_path, arrays_path)
    assert replayed is not None
    assert replayed["stem_role_types"] == {"bass": "instrument"}


def test_stem_role_sidecar_admission_covers_legacy_and_malformed_metadata(tmp_path) -> None:
    """A required sidecar fails closed while legacy role-field absence stays compatible."""
    arrays_path = tmp_path / "track.features.npz"
    metadata_path = arrays_path.with_suffix(".json")

    assert _has_canonical_stem_role_metadata(arrays_path, ["bass"]) is False

    metadata_path.write_text("{", encoding="utf-8")
    assert _has_canonical_stem_role_metadata(arrays_path, ["bass"]) is False

    metadata_path.write_text("[]", encoding="utf-8")
    assert _has_canonical_stem_role_metadata(arrays_path, ["bass"]) is False

    metadata_path.write_text(json.dumps({}), encoding="utf-8")
    assert _has_canonical_stem_role_metadata(arrays_path, ["bass"]) is True

    metadata_path.write_text(json.dumps({"stemRoleTypes": []}), encoding="utf-8")
    assert _has_canonical_stem_role_metadata(arrays_path, ["bass"]) is False
