"""Regression tests for bounded feature-cache metadata admission."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis import feature_cache_admission

_MAX_ADMITTED_METADATA_BYTES = 1024 * 1024


def test_oversized_feature_cache_metadata_fails_before_json_materialization(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reject oversized sidecar bytes before JSON can allocate the payload."""
    metadata_path = tmp_path / "features.json"
    metadata_path.write_text(
        '{"padding":"' + ("x" * _MAX_ADMITTED_METADATA_BYTES) + '"}',
        encoding="utf-8",
    )

    def fail_json_loads(*_args: object, **_kwargs: object) -> object:
        raise MemoryError("oversized cache metadata must not reach json.loads")

    monkeypatch.setattr(feature_cache_admission.json, "loads", fail_json_loads)

    assert feature_cache_admission.read_bounded_feature_cache_metadata(metadata_path) is None
