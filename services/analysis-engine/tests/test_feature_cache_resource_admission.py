"""Resource-admission regressions for reusable feature cache artifacts."""

import hashlib
import json
from unittest.mock import patch

import numpy as np

import bandscope_analysis.api as api
from bandscope_analysis.audio_resource_policy import DEFAULT_AUDIO_RESOURCE_POLICY

_EXPECTED_MANIFEST_LIMIT_BYTES = 64 * 1024
_EXPECTED_ARCHIVE_LIMIT_BYTES = (
    DEFAULT_AUDIO_RESOURCE_POLICY.max_decoded_audio_bytes * 4 + 16 * 1024 * 1024
)


def _valid_feature_cache(tmp_path):
    """Write one small v2 feature cache pair accepted by the current contract."""
    arrays_path = tmp_path / "track.features.npz"
    metadata_path = tmp_path / "track.features.json"
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))
    arrays_sha256 = hashlib.sha256(arrays_path.read_bytes()).hexdigest()
    payload = {
        "schemaVersion": api.FEATURE_CACHE_SCHEMA_VERSION,
        "source": {},
        "arraysSha256": arrays_sha256,
        "sampleRate": 44_100,
        "separation": {
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "notes": "fixture",
        },
        "stemKeys": ["bass"],
        "stemRoleTypes": {"bass": "instrument"},
    }
    metadata_path.write_text(json.dumps(payload), encoding="utf-8")
    return metadata_path, arrays_path, payload


def test_feature_cache_manifest_rejects_duplicate_json_keys(tmp_path) -> None:
    """Ambiguous duplicate manifest keys must fail closed instead of using last-one-wins JSON."""
    metadata_path, arrays_path, payload = _valid_feature_cache(tmp_path)
    canonical_digest = payload["arraysSha256"]
    metadata_path.write_text(
        "{"
        f'"schemaVersion":{api.FEATURE_CACHE_SCHEMA_VERSION},'
        '"source":{},'
        '"arraysSha256":"' + ("0" * 64) + '",'
        f'"arraysSha256":"{canonical_digest}",'
        '"sampleRate":44100,'
        '"separation":{"duration_seconds":1.0,"chunk_count":1,"notes":"fixture"},'
        '"stemKeys":["bass"],'
        '"stemRoleTypes":{"bass":"instrument"}'
        "}",
        encoding="utf-8",
    )

    with patch("bandscope_analysis.api.admitted_audio_cache_identity", return_value=None):
        assert api._load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_manifest_is_bounded_before_json_decode(tmp_path) -> None:
    """Locally replaced cache metadata must not create unbounded JSON read or parse work."""
    metadata_path, arrays_path, payload = _valid_feature_cache(tmp_path)
    encoded = json.dumps(payload)
    padding = " " * (_EXPECTED_MANIFEST_LIMIT_BYTES - len(encoded) + 1)
    metadata_path.write_text(encoded + padding, encoding="utf-8")

    with patch("bandscope_analysis.api.admitted_audio_cache_identity", return_value=None):
        assert api._load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_archive_size_is_rejected_before_hashing(tmp_path) -> None:
    """An oversized derived archive must miss before linear digest or NumPy work begins."""
    metadata_path = tmp_path / "track.features.json"
    arrays_path = tmp_path / "track.features.npz"
    arrays_path.touch()
    arrays_path.truncate(_EXPECTED_ARCHIVE_LIMIT_BYTES + 1)
    payload = {
        "schemaVersion": api.FEATURE_CACHE_SCHEMA_VERSION,
        "source": {},
        "arraysSha256": "0" * 64,
        "sampleRate": 44_100,
        "separation": {
            "duration_seconds": 1.0,
            "chunk_count": 1,
            "notes": "fixture",
        },
        "stemKeys": ["bass"],
        "stemRoleTypes": {"bass": "instrument"},
    }
    metadata_path.write_text(json.dumps(payload), encoding="utf-8")

    with (
        patch("bandscope_analysis.api.admitted_audio_cache_identity", return_value=None),
        patch(
            "bandscope_analysis.api._sha256_file",
            side_effect=AssertionError("oversized archive reached digest work"),
        ),
    ):
        assert api._load_cached_local_audio_features(metadata_path, arrays_path) is None
