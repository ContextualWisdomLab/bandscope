"""Regression contracts for final rehearsal-result cache admission."""

from __future__ import annotations

import copy
import hashlib
import json
from unittest.mock import patch

import pytest

from bandscope_analysis.api import (
    ANALYSIS_CACHE_SCHEMA_VERSION,
    _analysis_cache_path,
    _load_cached_analysis,
    _store_cached_analysis,
    build_demo_rehearsal_song,
    run_analysis_job_updates,
    validate_analysis_job_request,
)
from bandscope_analysis.final_result_cache import (
    FINAL_RESULT_ANALYSIS_GENERATION,
    MAX_FINAL_RESULT_CACHE_BYTES,
    _nonempty_string,
    _reject_duplicate_json_keys,
    _string_list,
    _valid_confidence,
    _valid_export_summary,
    _valid_part_graph_node,
    _valid_rehearsal_song,
    _valid_role,
    _valid_section,
    _valid_time_range,
    admitted_audio_cache_identity,
)


def _same_size_replacement(payload: bytes) -> bytes:
    """Return different bytes without changing the encoded byte count."""
    replacement = bytearray(payload)
    replacement[-1] ^= 0x01
    return bytes(replacement)


def _local_request(tmp_path, *, file_size_bytes: int = 64):
    """Build one app-rooted local-audio request for cache tests."""
    return validate_analysis_job_request(
        {
            "sourceKind": "local_audio",
            "projectId": "project-cache-identity",
            "sourceLabel": "source.wav",
            "roleFocus": ["bass-guitar"],
            "localSource": {
                "sourcePath": str(tmp_path / "source.wav"),
                "fileName": "source.wav",
                "extension": "wav",
                "fileSizeBytes": file_size_bytes,
            },
            "cacheRoot": str(tmp_path / "cache"),
            "tempRoot": str(tmp_path / "temp"),
        }
    )


def _set_admitted_identity(monkeypatch, payload: bytes) -> str:
    """Install one native-style evidence pair and return its digest."""
    digest = hashlib.sha256(payload).hexdigest()
    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", str(len(payload)))
    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", digest)
    return digest


def test_final_cache_cannot_cross_native_content_identity(tmp_path, monkeypatch) -> None:
    """Do not reuse a final result produced for another admitted content digest."""
    original = b"RIFF-admitted-cache-source"
    replacement = _same_size_replacement(original)
    source_path = tmp_path / "source.wav"
    source_path.write_bytes(original)
    request = _local_request(tmp_path, file_size_bytes=len(original))

    _set_admitted_identity(monkeypatch, original)
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None
    assert _store_cached_analysis(cache_path, request, build_demo_rehearsal_song()) is True

    source_path.write_bytes(replacement)
    _set_admitted_identity(monkeypatch, replacement)

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


def test_final_cache_round_trip_uses_same_native_identity(tmp_path, monkeypatch) -> None:
    """Reuse a valid result only while native admission evidence remains identical."""
    payload = b"RIFF-stable-cache-source"
    _set_admitted_identity(monkeypatch, payload)
    request = _local_request(tmp_path, file_size_bytes=len(payload))
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None

    song = build_demo_rehearsal_song()
    assert _store_cached_analysis(cache_path, request, song) is True
    assert _load_cached_analysis(cache_path) == song

    stored = json.loads(cache_path.read_text(encoding="utf-8"))
    assert stored["source"]["admittedAudio"] == {
        "fileSizeBytes": len(payload),
        "contentSha256": hashlib.sha256(payload).hexdigest(),
        "analysisGeneration": FINAL_RESULT_ANALYSIS_GENERATION,
    }


def test_final_cache_loader_rejects_native_identity_mismatch(tmp_path, monkeypatch) -> None:
    """Reject a copied cache payload whose stored admitted identity is not current."""
    first = b"RIFF-cache-source-a"
    second = _same_size_replacement(first)
    _set_admitted_identity(monkeypatch, first)
    request = _local_request(tmp_path, file_size_bytes=len(first))
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None
    assert _store_cached_analysis(cache_path, request, build_demo_rehearsal_song()) is True

    _set_admitted_identity(monkeypatch, second)
    assert _load_cached_analysis(cache_path) is None


def test_partial_native_identity_disables_cache_reuse(tmp_path, monkeypatch) -> None:
    """Fail cache admission closed when the native trust handoff is only partial."""
    request = _local_request(tmp_path)
    monkeypatch.setenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", "64")
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", raising=False)

    with pytest.raises(ValueError):
        admitted_audio_cache_identity()
    assert _analysis_cache_path(request) is None
    assert _store_cached_analysis(
        tmp_path / "cache.json",
        request,
        build_demo_rehearsal_song(),
    ) is False
    assert _load_cached_analysis(tmp_path / "cache.json") is None


def test_missing_native_identity_preserves_direct_library_cache(tmp_path, monkeypatch) -> None:
    """Keep the existing direct-library path while no native evidence is in scope."""
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", raising=False)
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", raising=False)
    assert admitted_audio_cache_identity() is None

    request = _local_request(tmp_path)
    cache_path = _analysis_cache_path(request)
    assert cache_path is not None
    song = build_demo_rehearsal_song()
    assert _store_cached_analysis(cache_path, request, song) is True
    assert _load_cached_analysis(cache_path) == song


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


@pytest.mark.parametrize(
    "raw_payload",
    [
        b"",
        b"{",
        b"\xff",
        b"[]",
        b'{"schemaVersion":999,"result":{}}',
        b'{"schemaVersion":1,"schemaVersion":1,"result":{}}',
    ],
)
def test_final_cache_loader_rejects_malformed_or_noncanonical_json(tmp_path, raw_payload) -> None:
    """Reject empty, undecodable, malformed, wrong-schema, or duplicate-key cache data."""
    cache_path = tmp_path / "analysis-cache.json"
    cache_path.write_bytes(raw_payload)
    assert _load_cached_analysis(cache_path) is None


def test_final_cache_loader_rejects_oversized_payload(tmp_path) -> None:
    """Bound cache parsing before JSON allocation or semantic admission."""
    cache_path = tmp_path / "analysis-cache.json"
    cache_path.write_bytes(b" " * (MAX_FINAL_RESULT_CACHE_BYTES + 1))
    assert _load_cached_analysis(cache_path) is None


def test_duplicate_json_hook_accepts_unique_keys_and_rejects_duplicates() -> None:
    """Reject ambiguous JSON objects at every nesting level."""
    assert _reject_duplicate_json_keys([("a", 1), ("b", 2)]) == {"a": 1, "b": 2}
    with pytest.raises(ValueError, match="duplicate JSON key"):
        _reject_duplicate_json_keys([("a", 1), ("a", 2)])


def test_semantic_cache_predicates_cover_valid_and_invalid_edges() -> None:
    """Exercise every final-result semantic boundary with representative bad values."""
    song = build_demo_rehearsal_song()
    section = song["sections"][0]
    role = section["roles"][0]
    node = section["partGraph"][0]

    assert _nonempty_string("role") is True
    assert _nonempty_string("") is False
    assert _nonempty_string(7) is False
    assert _string_list([]) is True
    assert _string_list(["bass", "keys"]) is True
    assert _string_list("bass") is False
    assert _string_list([""]) is False

    assert _valid_confidence(section["confidence"]) is True
    assert _valid_confidence(None) is False
    for field, value in (("level", ""), ("source", 1), ("notes", 1)):
        candidate = dict(section["confidence"])
        candidate[field] = value
        assert _valid_confidence(candidate) is False

    assert _valid_role(role) is True
    assert _valid_role(None) is False
    for field, value in (("id", ""), ("name", 1), ("roleType", ""), ("confidence", None)):
        candidate = dict(role)
        candidate[field] = value
        assert _valid_role(candidate) is False

    assert _valid_part_graph_node(node) is True
    assert _valid_part_graph_node(None) is False
    for field, value in (
        ("role_id", ""),
        ("is_active", 1),
        ("handoff_to", "bad"),
        ("handoff_from", [""]),
    ):
        candidate = dict(node)
        candidate[field] = value
        assert _valid_part_graph_node(candidate) is False

    assert _valid_time_range(section["timeRange"]) is True
    assert _valid_time_range(None) is False
    for candidate in (
        {"start": True, "end": 2},
        {"start": -1, "end": 2},
        {"start": 1, "end": True},
        {"start": 2, "end": 2},
        {"start": 0, "end": 4_294_967_296},
    ):
        assert _valid_time_range(candidate) is False

    assert _valid_section(section) is True
    assert _valid_section(None) is False
    for field, value in (
        ("id", ""),
        ("label", 1),
        ("groove", ""),
        ("timeRange", None),
        ("confidence", None),
        ("roles", "bad"),
        ("roles", [None]),
        ("partGraph", "bad"),
        ("partGraph", [None]),
    ):
        candidate = copy.deepcopy(section)
        candidate[field] = value
        assert _valid_section(candidate) is False

    summary = song["exportSummary"]
    assert _valid_export_summary(summary) is True
    assert _valid_export_summary(None) is False
    for field, value in (("format", ""), ("headline", 1), ("focusSections", [""])):
        candidate = dict(summary)
        candidate[field] = value
        assert _valid_export_summary(candidate) is False

    assert _valid_rehearsal_song(song) is True
    assert _valid_rehearsal_song(None) is False
    for field, value in (("id", ""), ("title", 1), ("sections", []), ("exportSummary", None)):
        candidate = copy.deepcopy(song)
        candidate[field] = value
        assert _valid_rehearsal_song(candidate) is False
    for invalid_tempo in (True, "120", 0):
        candidate = copy.deepcopy(song)
        candidate["tempo"] = invalid_tempo
        assert _valid_rehearsal_song(candidate) is False
    candidate = copy.deepcopy(song)
    candidate["tempo"] = 120
    assert _valid_rehearsal_song(candidate) is True
