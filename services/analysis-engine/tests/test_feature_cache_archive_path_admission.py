"""Regressions for persisted feature-cache archive path admission."""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pytest

from bandscope_analysis.feature_cache_admission import load_bounded_stem_archive


def test_feature_cache_replay_rejects_symlinked_archive(tmp_path: Path) -> None:
    """A cache pathname cannot redirect replay to a different filesystem object."""
    if not getattr(os, "O_NOFOLLOW", 0):
        pytest.skip("platform does not expose O_NOFOLLOW")

    target_path = tmp_path / "outside-cache.npz"
    arrays_path = tmp_path / "features.npz"
    metadata_path = arrays_path.with_suffix(".json")

    np.savez_compressed(
        target_path,
        stem_bass=np.zeros(16, dtype=np.float32),
    )
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
    try:
        arrays_path.symlink_to(target_path)
    except (NotImplementedError, OSError) as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    assert load_bounded_stem_archive(arrays_path, ["bass"], 44_100) is None
