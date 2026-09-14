"""Final rehearsal-result cache admission and publication helpers.

Native Resource Admission remains the authority for source byte-count/SHA-256 evidence.
This module owns the Python analysis boundary for final-result cache validation and
crash-aware publication only; it does not create a second source-identity authority.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
from contextlib import suppress
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
_SECTION_FORM_LABELS = frozenset(
    {
        "intro",
        "verse",
        "pre-chorus",
        "chorus",
        "bridge",
        "outro",
        "tag",
        "pickup",
        "stop",
        "handoff",
    }
)
_EXPORT_FORMATS = frozenset({"cue-sheet", "chart-summary"})
_ASSIGNMENT_STATUSES = frozenset({"todo", "in_progress", "ready", "blocked"})
_COMMENT_STATUSES = frozenset({"open", "resolved"})
_APPROVAL_STATUSES = frozenset({"pending", "approved", "changes_requested"})
_COLLABORATION_SYNC_MODES = frozenset({"local_only", "planned_cloud"})
_WINDOWS_MOVEFILE_REPLACE_EXISTING = 0x00000001
_WINDOWS_MOVEFILE_WRITE_THROUGH = 0x00000008


def _sync_parent_directory(directory: Path) -> None:
    """Flush a POSIX parent directory after an atomic cache-name replacement."""
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_fd = os.open(directory, flags)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _replace_windows_write_through(stage: Path, target: Path) -> None:
    """Replace a Windows cache entry with write-through rename semantics."""
    import ctypes
    from ctypes import wintypes

    win_dll = getattr(ctypes, "WinDLL", None)
    get_last_error = getattr(ctypes, "get_last_error", None)
    if win_dll is None or get_last_error is None:
        raise OSError("Windows write-through publication is unavailable")

    kernel32 = win_dll("kernel32", use_last_error=True)
    move_file_ex = kernel32.MoveFileExW
    move_file_ex.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
    move_file_ex.restype = wintypes.BOOL
    flags = _WINDOWS_MOVEFILE_REPLACE_EXISTING | _WINDOWS_MOVEFILE_WRITE_THROUGH
    if not move_file_ex(str(stage), str(target), flags):
        error_code = int(get_last_error())
        raise OSError(error_code, "Could not durably publish the final-result cache")


def _publish_synced_cache_stage(stage: Path, target: Path) -> None:
    """Publish a fully synced cache stage and durably commit its directory entry."""
    if os.name == "nt":
        _replace_windows_write_through(stage, target)
        return
    os.replace(stage, target)
    _sync_parent_directory(target.parent)


def store_durable_cache_payload(path: Path, payload: object) -> None:
    """Write one JSON cache payload and return only after durable publication succeeds."""
    path.parent.mkdir(parents=True, exist_ok=True)
    cache_file = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=".bandscope-final-cache-",
        suffix=".tmp",
        delete=False,
    )
    temp_path = Path(cache_file.name)
    try:
        with cache_file:
            json.dump(payload, cache_file, separators=(",", ":"))
            cache_file.flush()
            os.fsync(cache_file.fileno())
        _publish_synced_cache_stage(temp_path, path)
    except (OSError, TypeError, ValueError):
        with suppress(OSError):
            temp_path.unlink(missing_ok=True)
        raise
    with suppress(OSError):
        temp_path.unlink(missing_ok=True)


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


def _finite_number(value: object) -> bool:
    """Return whether a value is a finite JSON-style number rather than a Boolean."""
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


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


def _valid_transcription_note(value: object) -> bool:
    """Validate an optional persisted transcription note consumed by Groove Map."""
    return (
        isinstance(value, dict)
        and isinstance(value.get("pitch"), str)
        and _finite_number(value.get("onset"))
        and _finite_number(value.get("offset"))
        and _finite_number(value.get("velocity"))
    )


def _valid_role(value: object) -> bool:
    """Validate required and consumer-visible optional persisted role fields."""
    if not isinstance(value, dict):
        return False
    if not all(_nonempty_string(value.get(field)) for field in ("id", "name")):
        return False
    if value.get("roleType") not in _ROLE_TYPES:
        return False
    if not _valid_harmony(value.get("harmony")):
        return False
    if "harmonicExplanation" in value and not isinstance(value["harmonicExplanation"], str):
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
    if "transpositionPlan" in value and not isinstance(value["transpositionPlan"], str):
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
    if "transcription" in value:
        transcription = value["transcription"]
        if not isinstance(transcription, list) or not all(
            _valid_transcription_note(note) for note in transcription
        ):
            return False
    if "practiceProgress" in value:
        practice_progress = value["practiceProgress"]
        if (
            not isinstance(practice_progress, int)
            or isinstance(practice_progress, bool)
            or not 0 <= practice_progress <= 100
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
    if not _nonempty_string(value.get("id")):
        return False
    if value.get("label") not in _SECTION_FORM_LABELS:
        return False
    if not _nonempty_string(value.get("groove")):
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
        and value.get("format") in _EXPORT_FORMATS
        and _nonempty_string(value.get("headline"))
        and _string_list(value.get("focusSections"))
    )


def _valid_assignment(value: object) -> bool:
    """Validate one optional persisted collaboration assignment."""
    if not isinstance(value, dict):
        return False
    if not all(
        isinstance(value.get(field), str)
        for field in ("id", "assignee", "summary", "sectionId")
    ):
        return False
    if "roleId" in value and not isinstance(value["roleId"], str):
        return False
    return value.get("status") in _ASSIGNMENT_STATUSES


def _valid_comment(value: object) -> bool:
    """Validate one optional persisted rehearsal comment."""
    if not isinstance(value, dict):
        return False
    if not all(
        isinstance(value.get(field), str)
        for field in ("id", "author", "body", "sectionId")
    ):
        return False
    if "roleId" in value and not isinstance(value["roleId"], str):
        return False
    return value.get("status") in _COMMENT_STATUSES


def _valid_approval(value: object) -> bool:
    """Validate one optional persisted rehearsal approval."""
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(field), str) for field in ("id", "scope", "owner"))
        and value.get("status") in _APPROVAL_STATUSES
    )


def _valid_collaboration(value: object) -> bool:
    """Validate optional persisted collaboration state before a cache hit is trusted."""
    if not isinstance(value, dict):
        return False
    if value.get("syncMode") not in _COLLABORATION_SYNC_MODES:
        return False
    if not isinstance(value.get("syncNote"), str):
        return False
    assignments = value.get("assignments")
    comments = value.get("comments")
    approvals = value.get("approvals")
    return (
        isinstance(assignments, list)
        and all(_valid_assignment(item) for item in assignments)
        and isinstance(comments, list)
        and all(_valid_comment(item) for item in comments)
        and isinstance(approvals, list)
        and all(_valid_approval(item) for item in approvals)
    )


def _valid_score_attachment(value: object) -> bool:
    """Validate optional score metadata exposed by rehearsal views."""
    return (
        isinstance(value, dict)
        and _nonempty_string(value.get("id"))
        and _nonempty_string(value.get("fileName"))
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
    if not (
        isinstance(sections, list)
        and bool(sections)
        and all(_valid_section(section) for section in sections)
        and _valid_export_summary(value.get("exportSummary"))
    ):
        return False
    if "collaboration" in value and not _valid_collaboration(value["collaboration"]):
        return False
    if "scoreAttachments" in value:
        score_attachments = value["scoreAttachments"]
        if not isinstance(score_attachments, list) or not all(
            _valid_score_attachment(attachment) for attachment in score_attachments
        ):
            return False
    return True
