"""Regression contracts for final rehearsal-result cache admission."""

from __future__ import annotations

import hashlib
import json
from unittest.mock import patch

from bandscope_analysis.api import (
    ANALYSIS_CACHE_SCHEMA_VERSION,
    _analysis_cache_path,
    _load_cached_analysis,
    _store_cached_analysis,
    build_demo_rehearsal_song,
    run_analysis_job_updates,
    validate_analysis_job_request,
)


def _same_size_replacement(payload: bytes) -> bytes:
    """Return different bytes without changing the encoded byte count."""
    replacement = bytearray(payload)
    replacement[-1] ^= 0x01
    return bytes(replacement)


def test_final_cache_cannot_cross_native_content_identity(tmp_path, monkeypatch) -> None:
    """Do not reuse a final result produced for another admitted content digest."""
    original = b"RIFF-admitted-cache-source"
    replacement = _same_size_replacement(original)
    source_path = tmp_path / "source.wav"
    source_path.write_bytes(original)

    request = validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-cache-identity",
            "sourceLabel": "source.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": str(source_path),
                "fileName": "source.wav",
                "extension": "wav",
                "fileSizeBytes": len(original),
            },
            "cacheRoot": str(tmp_path / "cache"),
            "tempRoot": str(tmp_path / "temp"),
        }
    )
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None

    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", str(len(original)))
    monkeypatch.setenv(
        "BANDSCOPE_ADMITTED_AUDIO_SHA256",
        hashlib.sha256(original).hexdigest(),
    )
    assert _store_cached_analysis(cache_path, request, build_demo_rehearsal_song()) is True

    source_path.write_bytes(replacement)
    monkeypatch.setenv(
        "BANDSCOPE_ADMITTED_AUDIO_SHA256",
        hashlib.sha256(replacement).hexdigest(),
    )

    with patch(
        "bandscope_analysis.api._run_stem_separation_with_timeout",
        side_effect=ValueError("source changed before decode"),
    ) as separator:
        updates = run_analysis_job_updates(
            "job-cache-identity-mismatch",
            request,
            "2026-09-14T05:00:00Z",
        )

    assert updates[-1]["state"] == "failed"
    assert updates[-1].get("cacheStatus") == "miss"
    separator.assert_called_once()


def test_final_cache_rejects_structurally_invalid_rehearsal_song(tmp_path) -> None:
    """Treat a schema-versioned but semantically incomplete result as a cache miss."""
    cache_path = tmp_path / "analysis-cache.json"
    cache_path.write_text(
        json.dumps(
            {
                "schemaVersion": ANALYSIS_CACHE_SCHEMA_VERSION,
                "source": {
                    "fileName": "source.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024,
                },
                "result": {"id": "incomplete-song"},
            }
        ),
        encoding="utf-8",
    )

    assert _load_cached_analysis(cache_path) is None
