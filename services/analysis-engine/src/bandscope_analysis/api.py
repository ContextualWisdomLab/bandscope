"""Public API helpers for the BandScope analysis baseline."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Literal, NotRequired, TypedDict, cast

import numpy as np

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer
from bandscope_analysis.health import HealthReport, build_health_report
from bandscope_analysis.roles import RoleExtractor
from bandscope_analysis.sections import extract_sections, extract_structural_sections
from bandscope_analysis.separation import AudioStemSeparator
from bandscope_analysis.temporal import TemporalAnalyzer

MAX_SECTION_TIME_SECONDS = 4_294_967_295
ANALYSIS_CACHE_SCHEMA_VERSION = 1

AnalysisJobState = Literal["queued", "running", "succeeded", "failed"]
AnalysisJobStage = Literal["queued", "decode", "separate", "analyze", "persist", "ready"]
AnalysisCacheStatus = Literal["disabled", "miss", "hit", "stored"]


class AnalysisJobRequest(TypedDict):
    """Typed orchestration request payload accepted by the analysis engine."""

    sourceKind: Literal["demo", "local_audio"]
    sourceLabel: str
    roleFocus: list[str]
    projectId: NotRequired[str]
    localSource: NotRequired[LocalAudioSource]
    cacheRoot: NotRequired[str]
    tempRoot: NotRequired[str]


class LocalAudioSource(TypedDict):
    """Typed local-audio source descriptor accepted by the engine."""

    sourcePath: str
    fileName: str
    extension: Literal["wav", "mp3", "flac", "m4a"]
    fileSizeBytes: int


class AnalysisJobError(TypedDict):
    """Typed orchestration error payload returned on safe engine failures."""

    code: Literal["invalid_request", "not_found", "engine_unavailable"]
    message: str


class ConfidencePayload(TypedDict):
    """Typed confidence payload nested inside rehearsal results."""

    level: str
    source: str
    notes: str


class CuePayload(TypedDict):
    """Typed cue payload nested inside rehearsal results."""

    kind: str
    value: str


class RangePayload(TypedDict):
    """Typed range payload nested inside rehearsal results."""

    lowestNote: str
    highestNote: str


class HarmonyPayload(TypedDict):
    """Typed harmony payload nested inside rehearsal results."""

    chord: str
    functionLabel: str
    source: str


class ManualOverridePayload(TypedDict):
    """Typed manual override payload nested inside rehearsal roles."""

    field: str
    value: HarmonyPayload
    source: str


class RehearsalRolePayload(TypedDict):
    """Typed rehearsal role payload nested inside sections."""

    id: str
    name: str
    roleType: str
    harmony: HarmonyPayload
    cue: CuePayload
    range: RangePayload
    confidence: ConfidencePayload
    rehearsalPriority: str
    simplification: str
    setupNote: str
    manualOverrides: list[ManualOverridePayload]
    overlapWarnings: list[str]


class PartGraphNodePayload(TypedDict):
    """Typed part-graph node payload nested inside sections."""

    role_id: str
    is_active: bool
    handoff_to: list[str]
    handoff_from: list[str]


class SectionTimeRangePayload(TypedDict):
    """Typed timing range payload nested inside rehearsal sections."""

    start: int
    end: int


class RehearsalSectionPayload(TypedDict):
    """Typed rehearsal section payload nested inside songs."""

    id: str
    label: str
    groove: str
    timeRange: SectionTimeRangePayload
    confidence: ConfidencePayload
    roles: list[RehearsalRolePayload]
    partGraph: list[PartGraphNodePayload]


class ExportSummaryPayload(TypedDict):
    """Typed export summary payload nested inside songs."""

    format: str
    headline: str
    focusSections: list[str]


class RehearsalSong(TypedDict):
    """Typed rehearsal song payload returned by the bootstrap engine."""

    id: str
    title: str
    sections: list[RehearsalSectionPayload]
    exportSummary: ExportSummaryPayload


class AnalysisJobStatus(TypedDict):
    """Typed analysis job snapshot shared with the desktop orchestrator."""

    jobId: str
    state: AnalysisJobState
    requestedAt: str
    updatedAt: str
    progressLabel: NotRequired[str]
    progressStage: NotRequired[AnalysisJobStage]
    progressPercent: NotRequired[int]
    cacheStatus: NotRequired[AnalysisCacheStatus]
    result: NotRequired[RehearsalSong]
    error: NotRequired[AnalysisJobError]


class CachedAnalysisPayload(TypedDict):
    """Typed cached analysis payload persisted below the app-owned cache root."""

    schemaVersion: int
    source: dict[str, object]
    result: RehearsalSong


def build_section_time_range(start: object, end: object) -> SectionTimeRangePayload:
    """Build a section time range that matches the shared Rust u32 timing contract."""
    if (
        not isinstance(start, int)
        or isinstance(start, bool)
        or start < 0
        or start > MAX_SECTION_TIME_SECONDS
    ):
        raise ValueError("Invalid section timeRange: invalid field 'start'")
    if (
        not isinstance(end, int)
        or isinstance(end, bool)
        or end <= start
        or end > MAX_SECTION_TIME_SECONDS
    ):
        raise ValueError("Invalid section timeRange: invalid field 'end'")

    return {"start": start, "end": end}


def get_analysis_status() -> HealthReport:
    """Expose a small API-shaped status payload for CI and app wiring."""
    return build_health_report()


def validate_analysis_job_request(payload: object) -> AnalysisJobRequest:
    """Validate and normalize an engine job request payload."""
    if not isinstance(payload, dict):
        raise ValueError("Invalid analysis job request: invalid field 'root'")

    allowed_keys = {
        "sourceKind",
        "sourceLabel",
        "roleFocus",
        "projectId",
        "localSource",
        "cacheRoot",
        "tempRoot",
    }
    for key in payload:
        if key not in allowed_keys:
            raise ValueError(f"Invalid analysis job request: invalid field '{key}'")

    source_kind = payload.get("sourceKind")
    source_label = payload.get("sourceLabel")
    role_focus = payload.get("roleFocus")
    project_id = payload.get("projectId")
    cache_root = payload.get("cacheRoot")
    temp_root = payload.get("tempRoot")

    if source_kind not in {"demo", "local_audio"}:
        raise ValueError("Invalid analysis job request: invalid field 'sourceKind'")
    if not isinstance(source_label, str) or not source_label.strip():
        raise ValueError("Invalid analysis job request: invalid field 'sourceLabel'")
    if not isinstance(role_focus, list):
        raise ValueError("Invalid analysis job request: invalid field 'roleFocus'")
    for index, role in enumerate(role_focus):
        if not isinstance(role, str):
            raise ValueError(f"Invalid analysis job request: invalid field 'roleFocus[{index}]'")

    local_source = payload.get("localSource")
    if source_kind == "demo":
        if local_source is not None or project_id is not None:
            raise ValueError("Invalid analysis job request: invalid field 'projectId'")
        if cache_root is not None:
            raise ValueError("Invalid analysis job request: invalid field 'cacheRoot'")
        if temp_root is not None:
            raise ValueError("Invalid analysis job request: invalid field 'tempRoot'")
        return {
            "sourceKind": source_kind,
            "sourceLabel": source_label,
            "roleFocus": role_focus,
        }

    if not isinstance(project_id, str) or not project_id.strip():
        raise ValueError("Invalid analysis job request: invalid field 'projectId'")
    if local_source is None:
        raise ValueError("Invalid analysis job request: invalid field 'localSource'")
    if not isinstance(local_source, dict):
        raise ValueError("Invalid analysis job request: invalid field 'localSource'")
    allowed_local_keys = {"sourcePath", "fileName", "extension", "fileSizeBytes"}
    for key in local_source:
        if key not in allowed_local_keys:
            raise ValueError(f"Invalid analysis job request: invalid field 'localSource.{key}'")
    source_path = local_source.get("sourcePath")
    file_name = local_source.get("fileName")
    extension = local_source.get("extension")
    file_size_bytes = local_source.get("fileSizeBytes")
    if not isinstance(source_path, str) or not source_path.strip():
        raise ValueError("Invalid analysis job request: invalid field 'localSource.sourcePath'")
    if not isinstance(file_name, str) or not file_name.strip():
        raise ValueError("Invalid analysis job request: invalid field 'localSource.fileName'")
    if extension not in {"wav", "mp3", "flac", "m4a"}:
        raise ValueError("Invalid analysis job request: invalid field 'localSource.extension'")
    if not isinstance(file_size_bytes, int) or file_size_bytes <= 0:
        raise ValueError("Invalid analysis job request: invalid field 'localSource.fileSizeBytes'")

    normalized: AnalysisJobRequest = {
        "sourceKind": source_kind,
        "sourceLabel": source_label,
        "roleFocus": role_focus,
        "projectId": project_id,
        "localSource": {
            "sourcePath": source_path,
            "fileName": file_name,
            "extension": extension,
            "fileSizeBytes": file_size_bytes,
        },
    }
    if cache_root is not None:
        if not isinstance(cache_root, str) or not cache_root.strip():
            raise ValueError("Invalid analysis job request: invalid field 'cacheRoot'")
        normalized["cacheRoot"] = cache_root
    if temp_root is not None:
        if not isinstance(temp_root, str) or not temp_root.strip():
            raise ValueError("Invalid analysis job request: invalid field 'tempRoot'")
        normalized["tempRoot"] = temp_root

    return normalized


def build_demo_rehearsal_song(audio_features: dict[str, Any] | None = None) -> RehearsalSong:
    """Build a rehearsal payload from available structure, timing, and role features."""
    features = audio_features or {}

    use_structural = "temporal" in features
    section_windows: list[tuple[float, float]] = []
    section_chords: list[str] = []
    section_cues: list[str] = []
    if use_structural:
        structural = extract_structural_sections(features)
        extraction_result = structural["extraction"]
        sections = extraction_result["sections"]
        section_windows = structural["boundaries"]
        section_chords = structural["dominant_chords"]
        for section in sections:
            cue_value = section.get("cue_anchor", {}).get("value", "")
            section_cues.append(cue_value if isinstance(cue_value, str) else "")
    else:
        extraction_result = extract_sections(
            [{"label": "verse", "groove": "Straight eighths with a late snare feel"}]
        )
        sections = extraction_result["sections"]
        section_windows = [(10.0, 30.0)]
        section_chords = ["N"]
        section_cues = [""]

    role_result = RoleExtractor().extract(
        sections,
        features,
        section_windows=section_windows if use_structural else None,
        section_chords=section_chords if use_structural else None,
        lyric_cues=section_cues if use_structural else None,
    )

    rendered_sections: list[RehearsalSectionPayload] = []
    focus_sections: list[str] = []
    for index, section in enumerate(sections):
        topology = role_result["topologies"][index]
        section_start, section_end = (
            section_windows[index]
            if index < len(section_windows)
            else (float(index * 8), float((index + 1) * 8))
        )
        range_start = max(0, int(section_start))
        range_end = max(range_start + 1, int(np.ceil(section_end)))
        chord_hint = section_chords[index] if index < len(section_chords) else "N"
        cue_anchor = section.get("cue_anchor", {})
        cue_value = cue_anchor.get("value", "")
        confidence_notes = str(section.get("confidence_notes", "Detected structural boundary"))
        if cue_anchor.get("strategy") == "lyric" and isinstance(cue_value, str) and cue_value:
            confidence_notes = f"{confidence_notes} Cue lyric: {cue_value}."
        if chord_hint != "N":
            confidence_notes = f"{confidence_notes} Harmonic center near {chord_hint}."
        rendered_sections.append(
            {
                "id": str(section["id"]),
                "label": str(section["form_label"]),
                "groove": str(section["groove"]),
                "timeRange": build_section_time_range(range_start, range_end),
                "confidence": {
                    "level": cast(str, section["confidence_level"]),
                    "source": cast(str, section["confidence_source"]),
                    "notes": confidence_notes,
                },
                "roles": cast(list[RehearsalRolePayload], topology["active_roles"]),
                "partGraph": cast(list[PartGraphNodePayload], topology["part_graph"]),
            }
        )
        if topology["active_roles"]:
            focus_sections.append(str(section["form_label"]))

    unique_focus_sections = list(dict.fromkeys(focus_sections)) or [
        str(sections[0]["form_label"]) if sections else "verse"
    ]
    headline = (
        f"Prioritize {unique_focus_sections[0]} entries, then lock transitions across "
        f"{len(rendered_sections)} detected section(s)."
    )

    return {
        "id": "demo-song",
        "title": "Late Night Set",
        "sections": rendered_sections,
        "exportSummary": {
            "format": "cue-sheet",
            "headline": headline,
            "focusSections": unique_focus_sections,
        },
    }


def _build_job_status(
    *,
    job_id: str,
    state: AnalysisJobState,
    requested_at: str,
    progress_label: str | None = None,
    progress_stage: AnalysisJobStage | None = None,
    progress_percent: int | None = None,
    cache_status: AnalysisCacheStatus | None = None,
    result: RehearsalSong | None = None,
    error: AnalysisJobError | None = None,
) -> AnalysisJobStatus:
    """Build a shared job status envelope with optional orchestration progress."""
    status: AnalysisJobStatus = {
        "jobId": job_id,
        "state": state,
        "requestedAt": requested_at,
        "updatedAt": requested_at,
    }
    if progress_label is not None:
        status["progressLabel"] = progress_label
    if progress_stage is not None:
        status["progressStage"] = progress_stage
    if progress_percent is not None:
        status["progressPercent"] = progress_percent
    if cache_status is not None:
        status["cacheStatus"] = cache_status
    if result is not None:
        status["result"] = result
    if error is not None:
        status["error"] = error
    return status


def _analysis_cache_path(request: AnalysisJobRequest) -> Path | None:
    """Return the per-track cache path for a local-audio request when caching is enabled."""
    if request["sourceKind"] != "local_audio" or "localSource" not in request:
        return None
    cache_root = request.get("cacheRoot")
    if not cache_root:
        return None

    local_source = request["localSource"]
    key_payload = {
        "schemaVersion": ANALYSIS_CACHE_SCHEMA_VERSION,
        "projectId": request.get("projectId", ""),
        "sourcePath": local_source["sourcePath"],
        "fileName": local_source["fileName"],
        "fileSizeBytes": local_source["fileSizeBytes"],
    }
    digest = hashlib.sha256(
        json.dumps(key_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return Path(cache_root) / "analysis-cache-v1" / f"{digest}.json"


def _load_cached_analysis(path: Path) -> RehearsalSong | None:
    """Load a cached rehearsal result, treating malformed cache as a miss."""
    try:
        with path.open("r", encoding="utf-8") as cache_file:
            payload = json.load(cache_file)
    except (OSError, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None
    if payload.get("schemaVersion") != ANALYSIS_CACHE_SCHEMA_VERSION:
        return None
    result = payload.get("result")
    if not isinstance(result, dict):
        return None
    return cast(RehearsalSong, result)


def _store_cached_analysis(path: Path, request: AnalysisJobRequest, result: RehearsalSong) -> bool:
    """Persist cache metadata without storing the original absolute source path."""
    if "localSource" not in request:
        return False

    local_source = request["localSource"]
    payload: CachedAnalysisPayload = {
        "schemaVersion": ANALYSIS_CACHE_SCHEMA_VERSION,
        "source": {
            "fileName": local_source["fileName"],
            "extension": local_source["extension"],
            "fileSizeBytes": local_source["fileSizeBytes"],
        },
        "result": result,
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_suffix(".tmp")
        with temp_path.open("w", encoding="utf-8") as cache_file:
            json.dump(payload, cache_file, separators=(",", ":"))
        temp_path.replace(path)
    except OSError:
        return False
    return True


def _build_local_audio_features(request: AnalysisJobRequest) -> dict[str, Any] | None:
    """Build downstream audio features for a local-audio request."""
    if request["sourceKind"] != "local_audio" or "localSource" not in request:
        return None

    source_path = request["localSource"]["sourcePath"]
    separation_result = AudioStemSeparator().separate(source_path)
    try:
        temporal_result = TemporalAnalyzer().analyze(source_path)
    except (FileNotFoundError, ValueError):
        duration = float(separation_result["duration_seconds"])
        temporal_result = {
            "bpm": 120.0,
            "beat_times": [float(index) * 0.5 for index in range(max(1, int(duration * 2)))],
            "downbeat_times": [
                float(index) * 2.0 for index in range(max(1, int(np.ceil(duration / 2.0))))
            ],
            "duration_seconds": duration,
            "sample_rate": separation_result["sample_rate"],
            "audio_path": source_path,
        }
    chords = ChordRecognizer().recognize(
        separation_result["stems"].get("other", separation_result["stems"]["bass"]),
        sr=separation_result["sample_rate"],
    )
    return {
        "stems": separation_result["stems"],
        "sr": separation_result["sample_rate"],
        "temporal": temporal_result,
        "chords": chords,
        "separation": {
            "duration_seconds": separation_result["duration_seconds"],
            "chunk_count": separation_result["chunk_count"],
            "notes": separation_result["separation_notes"],
        },
    }


def run_analysis_job_updates(
    job_id: str,
    payload: object,
    requested_at: str,
) -> list[AnalysisJobStatus]:
    """Return incremental orchestration status updates for an analysis job."""
    try:
        request = validate_analysis_job_request(payload)
    except ValueError as error:
        return [
            _build_job_status(
                job_id=job_id,
                state="failed",
                requested_at=requested_at,
                error={
                    "code": "invalid_request",
                    "message": str(error),
                },
            )
        ]

    cache_path = _analysis_cache_path(request)
    cache_status: AnalysisCacheStatus = "disabled" if cache_path is None else "miss"
    if cache_path is not None:
        cached_result = _load_cached_analysis(cache_path)
        if cached_result is not None:
            return [
                _build_job_status(
                    job_id=job_id,
                    state="running",
                    requested_at=requested_at,
                    progress_label="Loading cached analysis",
                    progress_stage="persist",
                    progress_percent=95,
                    cache_status="hit",
                ),
                _build_job_status(
                    job_id=job_id,
                    state="succeeded",
                    requested_at=requested_at,
                    progress_label=f"Analysis ready for {request['sourceLabel']}",
                    progress_stage="ready",
                    progress_percent=100,
                    cache_status="hit",
                    result=cached_result,
                ),
            ]

    decode_label = (
        "Decoding local audio" if request["sourceKind"] == "local_audio" else "Preparing demo track"
    )
    updates = [
        _build_job_status(
            job_id=job_id,
            state="running",
            requested_at=requested_at,
            progress_label=decode_label,
            progress_stage="decode",
            progress_percent=20,
            cache_status=cache_status,
        ),
        _build_job_status(
            job_id=job_id,
            state="running",
            requested_at=requested_at,
            progress_label="Separating stems... (45%)",
            progress_stage="separate",
            progress_percent=45,
            cache_status=cache_status,
        ),
    ]

    try:
        audio_features = _build_local_audio_features(request)
    except (FileNotFoundError, ValueError) as error:
        updates.append(
            _build_job_status(
                job_id=job_id,
                state="failed",
                requested_at=requested_at,
                progress_label="Stem separation failed",
                progress_stage="separate",
                progress_percent=45,
                cache_status=cache_status,
                error={
                    "code": "engine_unavailable",
                    "message": f"Stem separation failed: {error}",
                },
            )
        )
        return updates

    updates.append(
        _build_job_status(
            job_id=job_id,
            state="running",
            requested_at=requested_at,
            progress_label="Building rehearsal cues",
            progress_stage="analyze",
            progress_percent=70,
            cache_status=cache_status,
        )
    )

    result = build_demo_rehearsal_song(audio_features)
    updates.append(
        _build_job_status(
            job_id=job_id,
            state="running",
            requested_at=requested_at,
            progress_label="Saving reusable features",
            progress_stage="persist",
            progress_percent=90,
            cache_status=cache_status,
        )
    )
    final_cache_status = cache_status
    if cache_path is not None:
        final_cache_status = (
            "stored" if _store_cached_analysis(cache_path, request, result) else "miss"
        )
    updates.append(
        _build_job_status(
            job_id=job_id,
            state="succeeded",
            requested_at=requested_at,
            progress_label=f"Analysis ready for {request['sourceLabel']}",
            progress_stage="ready",
            progress_percent=100,
            cache_status=final_cache_status,
            result=result,
        )
    )
    return updates


def run_analysis_job(job_id: str, payload: object, requested_at: str) -> AnalysisJobStatus:
    """Return a structured orchestration response for a validated analysis job."""
    return run_analysis_job_updates(job_id, payload, requested_at)[-1]
