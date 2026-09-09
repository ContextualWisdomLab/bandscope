"""Regression tests for persisted stem-role semantic admission."""

import json

import numpy as np

from bandscope_analysis.api import _load_cached_local_audio_features
from bandscope_analysis.feature_cache_admission import _has_canonical_stem_role_metadata


_SAMPLE_RATE = 22_050
_SAMPLE_COUNT = 4
_DURATION_SECONDS = _SAMPLE_COUNT / _SAMPLE_RATE


def _sidecar(*, stem_keys: list[str], stem_role_types: object = None) -> dict[str, object]:
    """Build generation-valid sidecar metadata for focused role-admission tests."""
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "sampleRate": _SAMPLE_RATE,
        "separation": {"duration_seconds": _DURATION_SECONDS},
        "stemKeys": stem_keys,
    }
    if stem_role_types is not None:
        payload["stemRoleTypes"] = stem_role_types
    return payload


def test_feature_cache_rejects_role_type_that_contradicts_canonical_stem_semantics(
    tmp_path,
) -> None:
    """A persisted instrument stem cannot be replayed as vocal rehearsal evidence."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"
    np.savez_compressed(arrays_path, stem_bass=np.zeros(_SAMPLE_COUNT, dtype=np.float32))

    metadata_path.write_text(
        json.dumps(_sidecar(stem_keys=["bass"], stem_role_types={"bass": "vocal"})),
        encoding="utf-8",
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None

    metadata_path.write_text(
        json.dumps(
            _sidecar(stem_keys=["bass"], stem_role_types={"bass": "instrument"})
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

    assert (
        _has_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
            expected_sample_rate=_SAMPLE_RATE,
        )
        is False
    )

    metadata_path.write_text("{", encoding="utf-8")
    assert (
        _has_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
            expected_sample_rate=_SAMPLE_RATE,
        )
        is False
    )

    metadata_path.write_text("[]", encoding="utf-8")
    assert (
        _has_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
            expected_sample_rate=_SAMPLE_RATE,
        )
        is False
    )

    metadata_path.write_text(
        json.dumps(_sidecar(stem_keys=["bass"])),
        encoding="utf-8",
    )
    assert _has_canonical_stem_role_metadata(
        arrays_path,
        ["bass"],
        expected_sample_rate=_SAMPLE_RATE,
    )

    metadata_path.write_text(
        json.dumps(_sidecar(stem_keys=["bass"], stem_role_types=[])),
        encoding="utf-8",
    )
    assert (
        _has_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
            expected_sample_rate=_SAMPLE_RATE,
        )
        is False
    )


def test_stem_role_sidecar_rejects_replacement_with_different_stem_identity(tmp_path) -> None:
    """A second-read sidecar must describe the exact stem identity already admitted."""
    arrays_path = tmp_path / "track.features.npz"
    metadata_path = arrays_path.with_suffix(".json")

    metadata_path.write_text(
        json.dumps(
            _sidecar(stem_keys=["bass"], stem_role_types={"bass": "instrument"})
        ),
        encoding="utf-8",
    )
    assert _has_canonical_stem_role_metadata(
        arrays_path,
        ["bass"],
        expected_sample_rate=_SAMPLE_RATE,
    )

    metadata_path.write_text(
        json.dumps(
            _sidecar(
                stem_keys=["drums"],
                stem_role_types={"drums": "instrument"},
            )
        ),
        encoding="utf-8",
    )
    assert (
        _has_canonical_stem_role_metadata(
            arrays_path,
            ["bass"],
            expected_sample_rate=_SAMPLE_RATE,
        )
        is False
    )
