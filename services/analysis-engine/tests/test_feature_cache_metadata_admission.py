"""Regression tests for bounded feature-cache metadata admission."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest

api = importlib.import_module("bandscope_analysis.api")

_MAX_ADMITTED_METADATA_BYTES = 1024 * 1024


def test_oversized_feature_cache_metadata_fails_before_json_materialization(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject oversized sidecar bytes before JSON can allocate the payload."""
    metadata_path = tmp_path / "features.json"
    arrays_path = tmp_path / "features.npz"
    metadata_path.write_text(
        '{"padding":"' + ("x" * _MAX_ADMITTED_METADATA_BYTES) + '"}',
        encoding="utf-8",
    )

    def fail_json_load(*_args: object, **_kwargs: object) -> object:
        raise MemoryError("oversized cache metadata must not reach json.load")

    monkeypatch.setattr(api.json, "load", fail_json_load)

    assert api._load_cached_local_audio_features(metadata_path, arrays_path) is None
