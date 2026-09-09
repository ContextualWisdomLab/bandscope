"""Regression tests for bounded feature-cache metadata admission."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

from bandscope_analysis import feature_cache_admission

api = importlib.import_module("bandscope_analysis.api")

_MAX_ADMITTED_METADATA_BYTES = 1024 * 1024


def _write_oversized_metadata(metadata_path: Path) -> None:
    metadata_path.write_text(
        '{"padding":"' + ("x" * _MAX_ADMITTED_METADATA_BYTES) + '"}',
        encoding="utf-8",
    )


def test_oversized_feature_cache_metadata_fails_before_json_materialization(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject oversized sidecar bytes before the bounded reader allocates JSON."""
    metadata_path = tmp_path / "features.json"
    _write_oversized_metadata(metadata_path)

    def fail_json_loads(*_args: object, **_kwargs: object) -> object:
        raise MemoryError("oversized cache metadata must not reach json.loads")

    monkeypatch.setattr(feature_cache_admission.json, "loads", fail_json_loads)

    assert feature_cache_admission.read_bounded_feature_cache_metadata(metadata_path) is None


def test_first_feature_cache_snapshot_uses_bounded_metadata_reader(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject oversized first-read metadata before the API can materialize JSON."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    _write_oversized_metadata(metadata_path)

    def fail_json_loads(*_args: object, **_kwargs: object) -> object:
        raise MemoryError("first cache snapshot must share bounded JSON admission")

    monkeypatch.setattr(feature_cache_admission.json, "loads", fail_json_loads)

    assert api._load_cached_local_audio_features(metadata_path, arrays_path) is None
