"""Public API helpers for the BandScope analysis baseline."""

from __future__ import annotations

from typing import Literal, TypedDict

from bandscope_analysis.health import HealthReport, build_health_report


class AnalysisJobRequest(TypedDict):
    """Typed orchestration request payload accepted by the analysis engine."""

    sourceKind: Literal["demo"]
    sourceLabel: str
    roleFocus: list[str]


class AnalysisJobError(TypedDict):
    """Typed orchestration error payload returned on safe engine failures."""

    code: Literal["invalid_request", "not_found", "engine_unavailable"]
    message: str


class RehearsalSong(TypedDict):
    """Typed rehearsal song payload returned by the bootstrap engine."""

    id: str
    title: str
    sections: list[dict[str, object]]
    exportSummary: dict[str, object]


class AnalysisJobStatus(TypedDict, total=False):
    """Typed analysis job snapshot shared with the desktop orchestrator."""

    jobId: str
    state: Literal["queued", "running", "succeeded", "failed"]
    requestedAt: str
    updatedAt: str
    progressLabel: str
    result: RehearsalSong
    error: AnalysisJobError


def get_analysis_status() -> HealthReport:
    """Expose a small API-shaped status payload for CI and app wiring."""
    return build_health_report()


def validate_analysis_job_request(payload: object) -> AnalysisJobRequest:
    """Validate and normalize an engine job request payload."""
    if not isinstance(payload, dict):
        raise ValueError("Invalid analysis job request: invalid field 'root'")

    allowed_keys = {"sourceKind", "sourceLabel", "roleFocus"}
    for key in payload:
        if key not in allowed_keys:
            raise ValueError(f"Invalid analysis job request: invalid field '{key}'")

    source_kind = payload.get("sourceKind")
    source_label = payload.get("sourceLabel")
    role_focus = payload.get("roleFocus")

    if source_kind != "demo":
        raise ValueError("Invalid analysis job request: invalid field 'sourceKind'")
    if not isinstance(source_label, str):
        raise ValueError("Invalid analysis job request: invalid field 'sourceLabel'")
    if not isinstance(role_focus, list):
        raise ValueError("Invalid analysis job request: invalid field 'roleFocus'")
    if not all(isinstance(role, str) for role in role_focus):
        raise ValueError("Invalid analysis job request: invalid field 'roleFocus[0]'")

    return {
        "sourceKind": source_kind,
        "sourceLabel": source_label,
        "roleFocus": role_focus,
    }


def build_demo_rehearsal_song() -> RehearsalSong:
    """Return the bootstrap rehearsal song payload for orchestration tests."""
    return {
        "id": "demo-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "verse-1",
                "label": "Verse 1",
                "groove": "Straight eighths with a late snare feel",
                "confidence": {
                    "level": "medium",
                    "source": "model",
                    "notes": "Double-check the pickup into the chorus.",
                },
                "roles": [
                    {
                        "id": "bass-guitar",
                        "name": "Bass Guitar",
                        "roleType": "instrument",
                        "harmony": {
                            "chord": "C#m7",
                            "functionLabel": "vi pedal anchor",
                            "source": "model",
                        },
                        "cue": {
                            "kind": "transition",
                            "value": "Hold through the pickup before the downbeat.",
                        },
                        "range": {"lowestNote": "C#2", "highestNote": "E3"},
                        "confidence": {
                            "level": "medium",
                            "source": "model",
                            "notes": "Watch the slide into the turnaround.",
                        },
                        "rehearsalPriority": "high",
                        "simplification": "Stay on roots if the chorus entrance gets muddy.",
                        "setupNote": "Keep the attack short so the verse breathes.",
                        "manualOverrides": [],
                    },
                    {
                        "id": "keys-right",
                        "name": "Keyboard 1 Right Hand",
                        "roleType": "hand",
                        "harmony": {
                            "chord": "Emaj7",
                            "functionLabel": "Imaj7 color",
                            "source": "model",
                        },
                        "cue": {
                            "kind": "count",
                            "value": "Enter on beat 2 after the pickup.",
                        },
                        "range": {"lowestNote": "B3", "highestNote": "G#5"},
                        "confidence": {
                            "level": "medium",
                            "source": "model",
                            "notes": "Top note voicing may need a quick ear check.",
                        },
                        "rehearsalPriority": "high",
                        "simplification": (
                            "Drop the top extension if the chorus turnaround still feels busy."
                        ),
                        "setupNote": "Keep the patch bright enough to stay over the guitars.",
                        "manualOverrides": [],
                    },
                    {
                        "id": "lead-vocal",
                        "name": "Lead Vocal",
                        "roleType": "vocal",
                        "harmony": {
                            "chord": "C#m7",
                            "functionLabel": "vi melodic pull",
                            "source": "model",
                        },
                        "cue": {"kind": "lyric", "value": "city lights"},
                        "range": {"lowestNote": "G#3", "highestNote": "C#5"},
                        "confidence": {
                            "level": "high",
                            "source": "user",
                            "notes": "Singer confirmed the pickup phrasing in rehearsal notes.",
                        },
                        "rehearsalPriority": "medium",
                        "simplification": (
                            "Keep the sustained note centered; skip the ad-lib on the first pass."
                        ),
                        "setupNote": "Watch the breath before the last line of the verse.",
                        "manualOverrides": [
                            {
                                "field": "harmony",
                                "value": {
                                    "chord": "C#m11",
                                    "functionLabel": "vi suspended lift",
                                    "source": "user",
                                },
                                "source": "user",
                            }
                        ],
                    },
                ],
            }
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Start with Verse 1 entrances before the chorus lift.",
            "focusSections": ["Verse 1"],
        },
    }


def run_analysis_job(job_id: str, payload: object, requested_at: str) -> AnalysisJobStatus:
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
