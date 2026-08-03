"""Regression tests for role-focused rehearsal analysis requests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from bandscope_analysis import api


def _role(role_id: str, name: str) -> api.RehearsalRolePayload:
    """Return one complete role payload for focus-filter tests."""
    return {
        "id": role_id,
        "name": name,
        "roleType": "instrument",
        "harmony": {"chord": "C", "functionLabel": "I", "source": "model"},
        "cue": {"kind": "count", "value": "1"},
        "range": {"lowestNote": "C2", "highestNote": "C4"},
        "confidence": {"level": "high", "source": "model", "notes": ""},
        "rehearsalPriority": "high",
        "simplification": "",
        "setupNote": "",
        "manualOverrides": [],
        "overlapWarnings": [],
    }


def _song() -> api.RehearsalSong:
    """Return a two-section song with cross-role part-graph links."""
    bass = _role("bass-guitar", "Bass Guitar")
    keys = _role("keys-right", "Keyboard Right Hand")
    vocal = _role("lead-vocal", "Lead Vocal")
    return {
        "id": "focus-song",
        "title": "Focus Song",
        "sections": [
            {
                "id": "verse-1",
                "label": "verse",
                "groove": "straight",
                "timeRange": {"start": 0, "end": 30},
                "confidence": {"level": "high", "source": "model", "notes": ""},
                "roles": [bass, keys],
                "partGraph": [
                    {
                        "role_id": "bass-guitar",
                        "is_active": True,
                        "handoff_to": ["keys-right", "lead-vocal"],
                        "handoff_from": [],
                    },
                    {
                        "role_id": "keys-right",
                        "is_active": True,
                        "handoff_to": [],
                        "handoff_from": ["bass-guitar"],
                    },
                ],
            },
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "lift",
                "timeRange": {"start": 30, "end": 60},
                "confidence": {"level": "medium", "source": "model", "notes": ""},
                "roles": [vocal],
                "partGraph": [
                    {
                        "role_id": "lead-vocal",
                        "is_active": True,
                        "handoff_to": [],
                        "handoff_from": ["bass-guitar"],
                    }
                ],
            },
        ],
        "exportSummary": {
            "format": "cue-sheet",
            "headline": "Focus the requested players.",
            "focusSections": ["verse", "chorus"],
        },
    }


def _role_ids(result: api.RehearsalSong) -> list[list[str]]:
    """Return role identifiers section by section."""
    return [[role["id"] for role in section["roles"]] for section in result["sections"]]


def test_analysis_result_enforces_requested_role_focus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A focused request returns only requested roles and in-scope graph links."""
    monkeypatch.setattr(api, "build_demo_rehearsal_song", lambda _features=None: _song())

    updates = api.run_analysis_job_updates(
        "job-focus",
        {
            "sourceKind": "demo",
            "sourceLabel": "Focus Song",
            "roleFocus": ["bass-guitar"],
        },
        "2026-08-03T06:00:00Z",
    )

    result = updates[-1]["result"]
    assert _role_ids(result) == [["bass-guitar"], []]
    assert result["sections"][0]["partGraph"] == [
        {
            "role_id": "bass-guitar",
            "is_active": True,
            "handoff_to": [],
            "handoff_from": [],
        }
    ]
    assert result["sections"][1]["partGraph"] == []
    assert result["exportSummary"]["focusSections"] == ["verse"]


def test_empty_role_focus_preserves_the_complete_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty focus remains the explicit all-roles request."""
    complete = _song()
    monkeypatch.setattr(api, "build_demo_rehearsal_song", lambda _features=None: complete)

    result = api.run_analysis_job_updates(
        "job-all",
        {"sourceKind": "demo", "sourceLabel": "Focus Song", "roleFocus": []},
        "2026-08-03T06:00:00Z",
    )[-1]["result"]

    assert result == complete


def test_cached_full_analysis_is_focused_per_request_without_cache_rewrite(
    tmp_path: Path,
) -> None:
    """One full cache entry safely serves different role-focused recipients."""
    request: api.AnalysisJobRequest = {
        "sourceKind": "local_audio",
        "sourceLabel": "focus.wav",
        "roleFocus": ["keys-right"],
        "projectId": "focus-project",
        "localSource": {
            "sourcePath": "/tmp/focus.wav",
            "fileName": "focus.wav",
            "extension": "wav",
            "fileSizeBytes": 1024,
        },
        "cacheRoot": str(tmp_path),
    }
    cache_path = api._analysis_cache_path(request)
    assert cache_path is not None
    cache_path.parent.mkdir(parents=True)
    complete = _song()
    cache_path.write_text(
        json.dumps(
            {
                "schemaVersion": api.ANALYSIS_CACHE_SCHEMA_VERSION,
                "source": {
                    "fileName": "focus.wav",
                    "extension": "wav",
                    "fileSizeBytes": 1024,
                },
                "result": complete,
            }
        ),
        encoding="utf-8",
    )

    result = api.run_analysis_job_updates(
        "job-cache",
        request,
        "2026-08-03T06:00:00Z",
    )[-1]["result"]

    assert _role_ids(result) == [["keys-right"], []]
    cached_payload: dict[str, Any] = json.loads(cache_path.read_text(encoding="utf-8"))
    assert _role_ids(cached_payload["result"]) == [
        ["bass-guitar", "keys-right"],
        ["lead-vocal"],
    ]
