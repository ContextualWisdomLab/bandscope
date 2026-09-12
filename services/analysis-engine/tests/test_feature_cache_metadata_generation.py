"""Regressions for persisted feature-cache metadata generation consistency."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.api import _load_cached_local_audio_features
from bandscope_analysis.feature_cache_admission import load_bounded_stem_archive


def _write_cache(metadata_path: Path, arrays_path: Path) -> None:
    """Write one admissible cached bass stem and its metadata sidecar."""
    metadata_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "sampleRate": 44_100,
                "separation": {
                    "duration_seconds": 16 / 44_100,
                    "chunk_count": 1,
                    "notes": "cached rehearsal stem",
                },
                "stemKeys": ["bass"],
                "stemRoleTypes": {"bass": "instrument"},
            }
        ),
        encoding="utf-8",
    )
    np.savez_compressed(arrays_path, stem_bass=np.zeros(16, dtype=np.float32))


def test_feature_cache_replay_rejects_second_read_sample_rate_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A second-read sidecar cannot substitute a different analysis sample rate."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_cache(metadata_path, arrays_path)

    real_loader = load_bounded_stem_archive

    def replace_sidecar_then_load(
        archive_path: Path,
        stem_keys: list[str],
        sample_rate: object,
        *,
        policy_template,
        expected_metadata_sha256=None,
        expected_archive_sha256=None,
    ):
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        payload["sampleRate"] = 48_000
        metadata_path.write_text(json.dumps(payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
            expected_metadata_sha256=expected_metadata_sha256,
            expected_archive_sha256=expected_archive_sha256,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        replace_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_second_read_schema_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A second-read sidecar cannot substitute another cache schema generation."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_cache(metadata_path, arrays_path)

    real_loader = load_bounded_stem_archive

    def replace_sidecar_then_load(
        archive_path: Path,
        stem_keys: list[str],
        sample_rate: object,
        *,
        policy_template,
        expected_metadata_sha256=None,
        expected_archive_sha256=None,
    ):
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        payload["schemaVersion"] = 2
        metadata_path.write_text(json.dumps(payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
            expected_metadata_sha256=expected_metadata_sha256,
            expected_archive_sha256=expected_archive_sha256,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        replace_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_missing_separation_duration(tmp_path: Path) -> None:
    """A cached stem timeline without duration authority must be recomputed, not replayed."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_cache(metadata_path, arrays_path)

    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    del payload["separation"]["duration_seconds"]
    metadata_path.write_text(json.dumps(payload), encoding="utf-8")

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_first_read_missing_duration_after_replacement(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A later valid sidecar cannot repair missing duration in the first metadata snapshot."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_cache(metadata_path, arrays_path)

    valid_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    first_payload = json.loads(json.dumps(valid_payload))
    del first_payload["separation"]["duration_seconds"]
    metadata_path.write_text(json.dumps(first_payload), encoding="utf-8")

    real_loader = load_bounded_stem_archive

    def restore_valid_sidecar_then_load(
        archive_path: Path,
        stem_keys: list[str],
        sample_rate: object,
        *,
        policy_template,
        expected_metadata_sha256=None,
        expected_archive_sha256=None,
    ):
        metadata_path.write_text(json.dumps(valid_payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
            expected_metadata_sha256=expected_metadata_sha256,
            expected_archive_sha256=expected_archive_sha256,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        restore_valid_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_first_read_role_substitution_after_replacement(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A later valid sidecar cannot repair contradictory first-read stem-role semantics."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_cache(metadata_path, arrays_path)

    valid_payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    first_payload = json.loads(json.dumps(valid_payload))
    first_payload["stemRoleTypes"] = {"bass": "vocal"}
    metadata_path.write_text(json.dumps(first_payload), encoding="utf-8")

    real_loader = load_bounded_stem_archive

    def restore_valid_sidecar_then_load(
        archive_path: Path,
        stem_keys: list[str],
        sample_rate: object,
        *,
        policy_template,
        expected_metadata_sha256=None,
        expected_archive_sha256=None,
    ):
        metadata_path.write_text(json.dumps(valid_payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
            expected_metadata_sha256=expected_metadata_sha256,
            expected_archive_sha256=expected_archive_sha256,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        restore_valid_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None
