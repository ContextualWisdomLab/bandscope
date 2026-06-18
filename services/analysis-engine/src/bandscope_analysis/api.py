"""Public API helpers for the BandScope analysis baseline."""

from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import queue
import time
from pathlib import Path
from typing import Any, Literal, NotRequired, TypedDict, cast

import numpy as np

from bandscope_analysis.health import HealthReport, build_health_report
from bandscope_analysis.roles import RoleExtractor
from bandscope_analysis.sections import extract_sections
from bandscope_analysis.separation import AudioStemSeparator

MAX_SECTION_TIME_SECONDS = 4_294_967_295
ANALYSIS_CACHE_SCHEMA_VERSION = 1
FEATURE_CACHE_SCHEMA_VERSION = 1
STEM_SEPARATION_TIMEOUT_SECONDS = 20.0

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


class CachedFeaturePayload(TypedDict):
    """Typed cached feature metadata persisted beside stem arrays."""

    schemaVersion: int
    source: dict[str, object]
    sampleRate: int
    separation: dict[str, object]
    stemKeys: list[str]


class StemSeparationTimedOut(RuntimeError):
    """Raised when local stem separation exceeds the orchestration timeout."""


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
    """Return the bootstrap rehearsal song payload for orchestration tests."""

    # Extract sections using the new pipeline
    arrangement = [{"label": "verse", "groove": "Straight eighths with a late snare feel"}]
    extraction_result = extract_sections(arrangement)
    verse_section = extraction_result["sections"][0]

    # Extract roles
    extractor = RoleExtractor()
    role_result = extractor.extract([verse_section], audio_features)
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


def _feature_cache_paths(request: AnalysisJobRequest) -> tuple[Path, Path] | None:
    """Return metadata + array cache paths for intermediate local-audio features."""
    analysis_cache_path = _analysis_cache_path(request)
    if analysis_cache_path is None:
        return None
    stem_cache_base = analysis_cache_path.with_suffix("")
    return (
        stem_cache_base.with_suffix(".features.json"),
        stem_cache_base.with_suffix(".features.npz"),
    )


def _stem_work_arrays_path(request: AnalysisJobRequest) -> Path | None:
    """Return an app-temp stem array path for process handoff when available."""
    if request["sourceKind"] != "local_audio" or "localSource" not in request:
        return None
    temp_root = request.get("tempRoot")
    if not temp_root:
        return None

    local_source = request["localSource"]
    key_payload = {
        "schemaVersion": FEATURE_CACHE_SCHEMA_VERSION,
        "projectId": request.get("projectId", ""),
        "sourcePath": local_source["sourcePath"],
        "fileName": local_source["fileName"],
        "fileSizeBytes": local_source["fileSizeBytes"],
    }
    digest = hashlib.sha256(
        json.dumps(key_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return Path(temp_root) / "stem-work-v1" / f"{digest}.npz"


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


def _load_cached_local_audio_features(
    metadata_path: Path, arrays_path: Path
) -> dict[str, Any] | None:
    """Load cached stem/features payload, treating malformed files as cache misses."""
    try:
        with metadata_path.open("r", encoding="utf-8") as metadata_file:
            metadata_payload = json.load(metadata_file)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(metadata_payload, dict):
        return None
    if metadata_payload.get("schemaVersion") != FEATURE_CACHE_SCHEMA_VERSION:
        return None
    if not isinstance(metadata_payload.get("sampleRate"), int):
        return None
    separation = metadata_payload.get("separation")
    if not isinstance(separation, dict):
        return None
    stem_keys = metadata_payload.get("stemKeys")
    if not isinstance(stem_keys, list) or not stem_keys:
        return None

    try:
        with np.load(arrays_path, allow_pickle=False) as stems_archive:
            stems: dict[str, np.ndarray] = {}
            for stem_key in stem_keys:
                if not isinstance(stem_key, str):
                    return None
                archive_key = f"stem_{stem_key}"
                if archive_key not in stems_archive:
                    return None
                stem_array = stems_archive[archive_key]
                if not isinstance(stem_array, np.ndarray):
                    return None
                stems[stem_key] = stem_array
    except (OSError, ValueError):
        return None

    return {
        "stems": stems,
        "sr": metadata_payload["sampleRate"],
        "separation": {
            "duration_seconds": separation.get("duration_seconds"),
            "chunk_count": separation.get("chunk_count"),
            "notes": separation.get("notes"),
        },
    }


def _serialize_stem_arrays(stems: object) -> dict[str, np.ndarray] | None:
    """Return validated stem arrays for compressed npz persistence."""
    if not isinstance(stems, dict) or not stems:
        return None

    serialized_stems: dict[str, np.ndarray] = {}
    for stem_name, stem_value in stems.items():
        if not isinstance(stem_name, str) or not stem_name:
            return None
        if not stem_name.isidentifier():
            return None
        if not isinstance(stem_value, np.ndarray):
            return None
        serialized_stems[f"stem_{stem_name}"] = stem_value
    return serialized_stems


def _store_cached_local_audio_features(
    metadata_path: Path,
    arrays_path: Path,
    request: AnalysisJobRequest,
    audio_features: dict[str, Any],
) -> bool:
    """Persist reusable local-audio features with atomic writes."""
    if "localSource" not in request:
        return False
    serialized_stems = _serialize_stem_arrays(audio_features.get("stems"))
    sample_rate = audio_features.get("sr")
    if serialized_stems is None:
        return False
    if not isinstance(sample_rate, int):
        return False
    separation = audio_features.get("separation")
    if not isinstance(separation, dict):
        return False

    local_source = request["localSource"]
    metadata_payload: CachedFeaturePayload = {
        "schemaVersion": FEATURE_CACHE_SCHEMA_VERSION,
        "source": {
            "fileName": local_source["fileName"],
            "extension": local_source["extension"],
            "fileSizeBytes": local_source["fileSizeBytes"],
        },
        "sampleRate": sample_rate,
        "separation": {
            "duration_seconds": separation.get("duration_seconds"),
            "chunk_count": separation.get("chunk_count"),
            "notes": separation.get("notes"),
        },
        "stemKeys": [key.replace("stem_", "", 1) for key in serialized_stems],
    }
    try:
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_temp = metadata_path.with_name(f"{metadata_path.name}.tmp")
        arrays_temp = arrays_path.with_name(f"{arrays_path.name}.tmp")
        with metadata_temp.open("w", encoding="utf-8") as metadata_file:
            json.dump(metadata_payload, metadata_file, separators=(",", ":"))
        with arrays_temp.open("wb") as arrays_file:
            np.savez_compressed(arrays_file, **cast(Any, serialized_stems))
        metadata_temp.replace(metadata_path)
        arrays_temp.replace(arrays_path)
    except OSError:
        return False
    return True


def _stem_separation_worker(
    source_path: str, result_queue: Any, arrays_path: str | None = None
) -> None:
    """Run stem separation in an isolated child process for enforceable timeout."""
    try:
        separation_result = AudioStemSeparator().separate(source_path)
        if arrays_path is not None:
            serialized_stems = _serialize_stem_arrays(separation_result.get("stems"))
            if not serialized_stems:
                raise RuntimeError("Stem separation returned invalid stems.")
            output_path = Path(arrays_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with output_path.open("wb") as arrays_file:
                np.savez_compressed(arrays_file, **cast(Any, serialized_stems))
            result_queue.put(
                (
                    "ok_file",
                    {
                        "arraysPath": str(output_path),
                        "sampleRate": separation_result["sample_rate"],
                        "separation": {
                            "duration_seconds": separation_result["duration_seconds"],
                            "chunk_count": separation_result["chunk_count"],
                            "notes": separation_result["separation_notes"],
                        },
                        "stemKeys": [key.replace("stem_", "", 1) for key in serialized_stems],
                    },
                )
            )
            return
        result_queue.put(("ok", separation_result))
    except FileNotFoundError as error:
        result_queue.put(("file_not_found", str(error)))
    except ValueError as error:
        result_queue.put(("value_error", str(error)))
    except RuntimeError as error:
        result_queue.put(("runtime_error", str(error)))
    except Exception as error:
        result_queue.put(("runtime_error", str(error)))


def _multiprocessing_context() -> mp.context.BaseContext:
    """Choose a process start method that works in tests and production."""
    methods = mp.get_all_start_methods()
    method = "fork" if "fork" in methods else "spawn"
    return mp.get_context(method)


def _stop_process(process: mp.Process) -> None:
    """Terminate a timed-out worker without waiting for the ML step to finish."""
    if not process.is_alive():
        return
    process.terminate()
    process.join(timeout=1)
    if process.is_alive():
        process.kill()
        process.join(timeout=1)


def _run_stem_separation_with_timeout(
    source_path: str,
    timeout_seconds: float | None = None,
    arrays_path: Path | None = None,
) -> dict[str, Any]:
    """Run local stem separation with a cross-platform process timeout."""
    timeout_budget = STEM_SEPARATION_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds
    context = _multiprocessing_context()
    result_queue = context.Queue(maxsize=1)
    process = cast(Any, context).Process(
        target=_stem_separation_worker,
        args=(source_path, result_queue, str(arrays_path) if arrays_path else None),
    )
    process.start()
    deadline = time.monotonic() + max(timeout_budget, 0.001)

    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                _stop_process(process)
                raise StemSeparationTimedOut(f"Stem separation exceeded {timeout_budget:g}s.")
            try:
                kind, payload = result_queue.get(timeout=min(remaining, 0.05))
                break
            except queue.Empty:
                if not process.is_alive():
                    process.join(timeout=1)
                    raise RuntimeError("Stem separation process ended without a result.") from None
    finally:
        result_queue.close()
        result_queue.join_thread()

    process.join(timeout=1)
    _stop_process(process)

    if kind == "ok":
        return cast(dict[str, Any], payload)
    if kind == "ok_file":
        if not isinstance(payload, dict):
            raise RuntimeError("Stem separation returned invalid metadata.")
        metadata_payload = {
            "schemaVersion": FEATURE_CACHE_SCHEMA_VERSION,
            "sampleRate": payload.get("sampleRate"),
            "separation": payload.get("separation"),
            "stemKeys": payload.get("stemKeys"),
        }
        arrays_output_path = Path(str(payload.get("arraysPath", "")))
        metadata_temp = arrays_output_path.with_suffix(".json")
        try:
            metadata_temp.write_text(json.dumps(metadata_payload), encoding="utf-8")
            loaded = _load_cached_local_audio_features(metadata_temp, arrays_output_path)
        except OSError:
            loaded = None
        if loaded is None:
            raise RuntimeError("Stem separation returned invalid stem arrays.")
        return loaded
    if kind == "file_not_found":
        raise FileNotFoundError(str(payload))
    if kind == "value_error":
        raise ValueError(str(payload))
    raise RuntimeError(str(payload))


def _build_local_audio_features(request: AnalysisJobRequest) -> dict[str, Any] | None:
    """Build downstream audio features for a local-audio request."""
    if request["sourceKind"] != "local_audio" or "localSource" not in request:
        return None

    separation_result = _run_stem_separation_with_timeout(
        request["localSource"]["sourcePath"],
        arrays_path=_stem_work_arrays_path(request),
    )
    if "sample_rate" not in separation_result:
        return separation_result
    return {
        "stems": separation_result["stems"],
        "sr": separation_result["sample_rate"],
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
    feature_cache_paths = _feature_cache_paths(request)
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
    ]
    audio_features: dict[str, Any] | None = None
    if feature_cache_paths is not None:
        cached_features = _load_cached_local_audio_features(*feature_cache_paths)
        if cached_features is not None:
            audio_features = cached_features
            updates.append(
                _build_job_status(
                    job_id=job_id,
                    state="running",
                    requested_at=requested_at,
                    progress_label="Loaded reusable stems... (45%)",
                    progress_stage="separate",
                    progress_percent=45,
                    cache_status=cache_status,
                )
            )

    if audio_features is None:
        updates.append(
            _build_job_status(
                job_id=job_id,
                state="running",
                requested_at=requested_at,
                progress_label="Separating stems... (45%)",
                progress_stage="separate",
                progress_percent=45,
                cache_status=cache_status,
            )
        )
        try:
            audio_features = _build_local_audio_features(request)
        except StemSeparationTimedOut:
            updates.append(
                _build_job_status(
                    job_id=job_id,
                    state="running",
                    requested_at=requested_at,
                    progress_label="Stem separation timed out; continuing with fallback cues",
                    progress_stage="separate",
                    progress_percent=55,
                    cache_status=cache_status,
                )
            )
            audio_features = None
        except RuntimeError:
            updates.append(
                _build_job_status(
                    job_id=job_id,
                    state="running",
                    requested_at=requested_at,
                    progress_label="Stem separation unavailable; continuing with fallback cues",
                    progress_stage="separate",
                    progress_percent=55,
                    cache_status=cache_status,
                )
            )
            audio_features = None
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
    if audio_features is not None and feature_cache_paths is not None:
        _store_cached_local_audio_features(
            feature_cache_paths[0], feature_cache_paths[1], request, audio_features
        )
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
