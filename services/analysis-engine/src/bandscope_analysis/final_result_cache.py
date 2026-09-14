"""Final rehearsal-result cache admission helpers.

This module is intentionally limited to cache identity and read-time admission. Native
Resource Admission remains the authority for source byte-count/SHA-256 evidence, and
Project Persistence remains the authority for crash-durable filesystem publication.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from bandscope_analysis.separation.audio_separator import (
    _admitted_audio_evidence_from_environment,
)

MAX_FINAL_RESULT_CACHE_BYTES = 4 * 1024 * 1024
FINAL_RESULT_ANALYSIS_GENERATION = 1
_MAX_SECTION_TIME_SECONDS = 4_294_967_295
_ROLE_TYPES = frozenset({"instrument", "vocal", "hand"})
_CONFIDENCE_LEVELS = frozenset({"low", "medium", "high"})
_PROVENANCE_SOURCES = frozenset({"model", "user"})
_CUE_KINDS = frozenset({"lyric", "count", "transition"})
_REHEARSAL_PRIORITIES = frozenset({"low", "medium", "high"})


def admitted_audio_cache_identity() -> dict[str, object] | None:
    """Return native-owned source identity fields for one analysis child process.

    Missing evidence preserves direct-library compatibility. A partial or malformed
    pair raises ``ValueError`` so callers can disable cache reuse rather than fall
    back to a pathname/size-only identity before the decode boundary rejects it.
    """
    evidence = _admitted_audio_evidence_from_environment()
    if evidence is None:
        return None
    file_size_bytes, content_sha256 = evidence
    return {
        "fileSizeBytes": file_size_bytes,
        "contentSha256": content_sha256,
        "analysisGeneration": FINAL_RESULT_ANALYSIS_GENERATION,
    }


def load_admitted_rehearsal_song(path: Path, *, schema_version: int) -> dict[str, Any] | None:
    """Load one bounded, duplicate-free, semantically valid rehearsal result cache."""
    try:
        expected_identity = admitted_audio_cache_identity()
    except ValueError:
        return None

    try:
        with path.open("rb") as cache_file:
            raw_payload = cache_file.read(MAX_FINAL_RESULT_CACHE_BYTES + 1)
    except OSError:
        return None
    if not raw_payload or len(raw_payload) > MAX_FINAL_RESULT_CACHE_BYTES:
        return None

    try:
        payload = json.loads(
            raw_payload.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_json_keys,
        )
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict) or payload.get("schemaVersion") != schema_version:
        return None
    if expected_identity is not None:
        source = payload.get("source")
        if not isinstance(source, dict) or source.get("admittedAudio") != expected_identity:
            return None
    result = payload.get("result")
    if not _valid_rehearsal_song(result):
        return None
    return result


def _reject_duplicate_json_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Build one JSON object while rejecting duplicate keys at every nesting level."""
    payload: dict[str, object] = {}
    for key, value in pairs:
        if key in payload:
            raise ValueError(f"duplicate JSON key: {key}")
        payload[key] = value
    return payload


def _nonempty_string(value: object) -> bool:
    """Return whether a value is a non-blank string."""
    return isinstance(value, str) and bool(value.strip())


def _string_list(value: object) -> bool:
    """Return whether a value is a list containing only non-blank strings."""
    return isinstance(value, list) and all(_nonempty_string(item) for item in value)


def _valid_confidence(value: object) -> bool:
    """Validate the persisted confidence payload needed by rehearsal views."""
    return (
        isinstance(value, dict)
        and value.get("level") in _CONFIDENCE_LEVELS
        and value.get("source") in _PROVENANCE_SOURCES
        and isinstance(value.get("notes"), str)
    )


def _valid_harmony(value: object) -> bool:
    """Validate one persisted harmony payload without inventing musical evidence."""
    return (
        isinstance(value, dict)
        and isinstance(value.get("chord"), str)
        and isinstance(value.get("functionLabel"), str)
        and value.get("source") in _PROVENANCE_SOURCES
    )


def _valid_cue(value: object) -> bool:
    """Validate one persisted rehearsal cue consumed by timeline and role views."""
    return (
        isinstance(value, dict)
        and value.get("kind") in _CUE_KINDS
        and isinstance(value.get("value"), str)
    )


def _valid_range(value: object) -> bool:
    """Validate one persisted note-range summary."""
    return (
        isinstance(value, dict)
        and isinstance(value.get("lowestNote"), str)
        and isinstance(value.get("highestNote"), str)
    )


def _valid_manual_override(value: object) -> bool:
    """Validate the only currently supported persisted manual override shape."""
    if not isinstance(value, dict):
        return False
    harmony = value.get("value")
    return (
        value.get("field") == "harmony"
        and value.get("source") == "user"
        and _valid_harmony(harmony)
        and isinstance(harmony, dict)
        and harmony.get("source") == "user"
    )


def _valid_role(value: object) -> bool:
    """Validate every required persisted role field used by downstream consumers."""
    if not isinstance(value, dict):
        return False
    if not all(_nonempty_string(value.get(field)) for field in ("id", "name")):
        return False
    if value.get("roleType") not in _ROLE_TYPES:
        return False
    if not _valid_harmony(value.get("harmony")):
        return False
    if not _valid_cue(value.get("cue")):
        return False
    if not _valid_range(value.get("range")):
        return False
    if not _valid_confidence(value.get("confidence")):
        return False
    if value.get("rehearsalPriority") not in _REHEARSAL_PRIORITIES:
        return False
    if not isinstance(value.get("simplification"), str):
        return False
    if not isinstance(value.get("setupNote"), str):
        return False
    manual_overrides = value.get("manualOverrides")
    if not isinstance(manual_overrides, list) or not all(
        _valid_manual_override(override) for override in manual_overrides
    ):
        return False
    overlap_warnings = value.get("overlapWarnings")
    if not isinstance(overlap_warnings, list) or not all(
        isinstance(warning, str) for warning in overlap_warnings
    ):
        return False
    return True


def _valid_part_graph_node(value: object) -> bool:
    """Validate one section part-graph node and its handoff references."""
    return (
        isinstance(value, dict)
        and _nonempty_string(value.get("role_id"))
        and isinstance(value.get("is_active"), bool)
        and _string_list(value.get("handoff_to"))
        and _string_list(value.get("handoff_from"))
    )


def _valid_time_range(value: object) -> bool:
    """Validate the shared unsigned section-time interval contract."""
    if not isinstance(value, dict):
        return False
    start = value.get("start")
    end = value.get("end")
    return (
        isinstance(start, int)
        and not isinstance(start, bool)
        and isinstance(end, int)
        and not isinstance(end, bool)
        and 0 <= start < end <= _MAX_SECTION_TIME_SECONDS
    )


def _valid_section(value: object) -> bool:
    """Validate one persisted rehearsal section before exposing a cache hit."""
    if not isinstance(value, dict):
        return False
    if not all(_nonempty_string(value.get(field)) for field in ("id", "label", "groove")):
        return False
    if not _valid_time_range(value.get("timeRange")) or not _valid_confidence(
        value.get("confidence")
    ):
        return False
    roles = value.get("roles")
    part_graph = value.get("partGraph")
    return (
        isinstance(roles, list)
        and all(_valid_role(role) for role in roles)
        and isinstance(part_graph, list)
        and all(_valid_part_graph_node(node) for node in part_graph)
    )


def _valid_export_summary(value: object) -> bool:
    """Validate the cached cue-sheet summary consumed by export and rehearsal UI."""
    return (
        isinstance(value, dict)
        and _nonempty_string(value.get("format"))
        and _nonempty_string(value.get("headline"))
        and _string_list(value.get("focusSections"))
    )


def _valid_rehearsal_song(value: object) -> bool:
    """Validate the persisted RehearsalSong envelope before trusting cached content."""
    if not isinstance(value, dict):
        return False
    if not _nonempty_string(value.get("id")) or not _nonempty_string(value.get("title")):
        return False
    tempo = value.get("tempo")
    if tempo is not None and (
        not isinstance(tempo, int) or isinstance(tempo, bool) or tempo <= 0
    ):
        return False
    sections = value.get("sections")
    return (
        isinstance(sections, list)
        and bool(sections)
        and all(_valid_section(section) for section in sections)
        and _valid_export_summary(value.get("exportSummary"))
    )
