"""Public API helpers for the BandScope analysis baseline."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict, cast

from bandscope_analysis.health import HealthReport, build_health_report
from bandscope_analysis.roles import RoleExtractor
from bandscope_analysis.sections import extract_sections

MAX_SECTION_TIME_SECONDS = 4_294_967_295


class AnalysisJobRequest(TypedDict):
    """Typed orchestration request payload accepted by the analysis engine."""

    sourceKind: Literal["demo", "local_audio"]
    sourceLabel: str
    roleFocus: list[str]
    projectId: NotRequired[str]
    localSource: NotRequired[LocalAudioSource]


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
    state: Literal["queued", "running", "succeeded", "failed"]
    requestedAt: str
    updatedAt: str
    progressLabel: NotRequired[str]
    result: NotRequired[RehearsalSong]
    error: NotRequired[AnalysisJobError]


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

    allowed_keys = {"sourceKind", "sourceLabel", "roleFocus", "projectId", "localSource"}
    for key in payload:
        if key not in allowed_keys:
            raise ValueError(f"Invalid analysis job request: invalid field '{key}'")

    source_kind = payload.get("sourceKind")
    source_label = payload.get("sourceLabel")
    role_focus = payload.get("roleFocus")
    project_id = payload.get("projectId")

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

    return {
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


def build_demo_rehearsal_song() -> RehearsalSong:
    """Return the bootstrap rehearsal song payload for orchestration tests."""

    # Extract sections using the new pipeline
    arrangement = [{"label": "verse", "groove": "Straight eighths with a late snare feel"}]
    extraction_result = extract_sections(arrangement)
    verse_section = extraction_result["sections"][0]

    # Extract roles
    extractor = RoleExtractor()
    role_result = extractor.extract([verse_section])
    verse_topology = role_result["topologies"][0]
    verse_roles = verse_topology["active_roles"]

    return {
        "id": "demo-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": verse_section["id"],
                "label": verse_section["form_label"],
                "groove": verse_section["groove"],
                "timeRange": build_section_time_range(10, 30),
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Double-check the pickup into the chorus.",
                },
                "roles": cast(list[RehearsalRolePayload], verse_roles),
                "partGraph": cast(Any, verse_topology["part_graph"]),
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Start with verse entrances before the chorus lift.",
            "focusSections": ["verse"],
        },
    }


def run_analysis_job(
    job_id: str, payload: object, requested_at: str, stems: dict[str, Any] | None = None
) -> AnalysisJobStatus:
    """Return a structured orchestration response for a validated analysis job."""
    try:
        request = validate_analysis_job_request(payload)
    except ValueError as error:
        return {
            "jobId": job_id,
            "state": "failed",
            "requestedAt": requested_at,
            "updatedAt": requested_at,
            "error": {
                "code": "invalid_request",
                "message": str(error),
            },
        }

    return {
        "jobId": job_id,
        "state": "succeeded",
        "requestedAt": requested_at,
        "updatedAt": requested_at,
        "progressLabel": f"Analysis ready for {request['sourceLabel']}",
        "result": build_demo_rehearsal_song(),
    }
