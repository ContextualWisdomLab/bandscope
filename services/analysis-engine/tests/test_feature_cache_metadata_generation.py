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
    ):
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        payload["sampleRate"] = 48_000
        metadata_path.write_text(json.dumps(payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
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
    ):
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        payload["schemaVersion"] = 2
        metadata_path.write_text(json.dumps(payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        replace_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None


def test_feature_cache_replay_rejects_second_read_metadata_generation_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A second read cannot silently mix provenance from another metadata generation."""
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
    ):
        payload = json.loads(metadata_path.read_text(encoding="utf-8"))
        payload["separation"]["chunk_count"] = 2
        payload["separation"]["notes"] = "replacement generation"
        metadata_path.write_text(json.dumps(payload), encoding="utf-8")
        return real_loader(
            archive_path,
            stem_keys,
            sample_rate,
            policy_template=policy_template,
        )

    monkeypatch.setattr(
        "bandscope_analysis.api.load_bounded_stem_archive",
        replace_sidecar_then_load,
    )

    assert _load_cached_local_audio_features(metadata_path, arrays_path) is None
