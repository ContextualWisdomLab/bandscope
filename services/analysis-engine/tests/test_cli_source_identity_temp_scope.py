"""Regression coverage for source-bound temporary stem-work paths."""

from __future__ import annotations

from pathlib import Path

from bandscope_analysis.cli import _bind_verified_source_cache_namespace


def test_verified_digest_scopes_temp_work_to_exact_source_identity() -> None:
    """Prevent same-metadata replacement audio from sharing one stem-work path."""
    source_digest = "ab" * 32
    request = {
        "sourceKind": "local_audio",
        "cacheRoot": "/tmp/cache",
        "tempRoot": "/tmp/work",
    }

    bound = _bind_verified_source_cache_namespace(request, source_digest)

    assert isinstance(bound, dict)
    assert Path(str(bound["cacheRoot"])).parts[-2:] == (
        "source-sha256-v1",
        source_digest,
    )
    assert Path(str(bound["tempRoot"])).parts[-2:] == (
        "source-sha256-v1",
        source_digest,
    )
