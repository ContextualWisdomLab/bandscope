"""Shared-contract regressions for persisted final rehearsal-result admission."""

from __future__ import annotations

import copy
import json

import pytest

from bandscope_analysis.api import ANALYSIS_CACHE_SCHEMA_VERSION, build_demo_rehearsal_song
from bandscope_analysis.final_result_cache import load_admitted_rehearsal_song


def _load_candidate(tmp_path, monkeypatch, song):
    """Persist one cache candidate and run the production admission boundary."""
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_BYTES", raising=False)
    monkeypatch.delenv("BANDSCOPE_ADMITTED_AUDIO_SHA256", raising=False)
    path = tmp_path / "analysis-cache.json"
    path.write_text(
        json.dumps(
            {
                "schemaVersion": ANALYSIS_CACHE_SCHEMA_VERSION,
                "source": {},
                "result": song,
            }
        ),
        encoding="utf-8",
    )
    return load_admitted_rehearsal_song(path, schema_version=ANALYSIS_CACHE_SCHEMA_VERSION)


def _attach_valid_collaboration(song):
    """Attach one valid optional collaboration payload for nested admission tests."""
    role = song["sections"][0]["roles"][0]
    song["collaboration"] = {
        "syncMode": "local_only",
        "syncNote": "Local rehearsal notes only.",
        "assignments": [
            {
                "id": "assignment-1",
                "assignee": "Bass",
                "summary": "Lock the pickup.",
                "sectionId": song["sections"][0]["id"],
                "roleId": role["id"],
                "status": "in_progress",
            }
        ],
        "comments": [
            {
                "id": "comment-1",
                "author": "MD",
                "body": "Keep the entrance short.",
                "sectionId": song["sections"][0]["id"],
                "roleId": role["id"],
                "status": "open",
            }
        ],
        "approvals": [
            {
                "id": "approval-1",
                "scope": "Verse entrance",
                "owner": "MD",
                "status": "pending",
            }
        ],
    }


def test_cache_rejects_section_and_export_enums_outside_shared_contract(
    tmp_path, monkeypatch
) -> None:
    """Do not admit persisted enum values that the shared UI contract cannot consume."""
    song = build_demo_rehearsal_song()

    invalid_section = copy.deepcopy(song)
    invalid_section["sections"][0]["label"] = "custom-section"
    assert _load_candidate(tmp_path, monkeypatch, invalid_section) is None

    invalid_export = copy.deepcopy(song)
    invalid_export["exportSummary"]["format"] = "json"
    assert _load_candidate(tmp_path, monkeypatch, invalid_export) is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("harmonicExplanation", 7),
        ("transpositionPlan", {"steps": -2}),
        ("transcription", "C4"),
        (
            "transcription",
            [{"pitch": "C4", "onset": 0.0, "offset": 1.0, "velocity": True}],
        ),
        ("practiceProgress", 101),
        ("practiceProgress", True),
    ],
)
def test_cache_rejects_invalid_optional_role_fields(
    tmp_path, monkeypatch, field, value
) -> None:
    """Optional persisted role fields become authoritative when present and must validate."""
    song = build_demo_rehearsal_song()
    song["sections"][0]["roles"][0][field] = value
    assert _load_candidate(tmp_path, monkeypatch, song) is None


def test_cache_rejects_invalid_optional_song_fields(tmp_path, monkeypatch) -> None:
    """Reject malformed collaboration and score metadata before exposing a cache hit."""
    song = build_demo_rehearsal_song()

    invalid_collaboration = copy.deepcopy(song)
    invalid_collaboration["collaboration"] = {
        "syncMode": "cloud",
        "syncNote": "",
        "assignments": [],
        "comments": [],
        "approvals": [],
    }
    assert _load_candidate(tmp_path, monkeypatch, invalid_collaboration) is None

    invalid_scores = copy.deepcopy(song)
    invalid_scores["scoreAttachments"] = [{"id": "score-1", "fileName": 7}]
    assert _load_candidate(tmp_path, monkeypatch, invalid_scores) is None


def test_cache_accepts_valid_optional_shared_contract_fields(tmp_path, monkeypatch) -> None:
    """Preserve legitimate optional rehearsal fields while tightening cache admission."""
    song = build_demo_rehearsal_song()
    role = song["sections"][0]["roles"][0]
    role["harmonicExplanation"] = "Keep the upper extension out of the bass register."
    role["transpositionPlan"] = "Move the shape down a whole step if the singer drops the key."
    role["transcription"] = [
        {"pitch": "C4", "onset": 0.0, "offset": 0.5, "velocity": 92.0}
    ]
    role["practiceProgress"] = 60
    _attach_valid_collaboration(song)
    song["scoreAttachments"] = [{"id": "score-1", "fileName": "verse-chart.pdf"}]

    assert _load_candidate(tmp_path, monkeypatch, song) == song


def test_cache_rejects_unknown_keys_at_shared_contract_boundaries(tmp_path, monkeypatch) -> None:
    """Reject forward-incompatible fields anywhere the shared validator is key-strict."""
    base_song = build_demo_rehearsal_song()

    candidates = []

    song = copy.deepcopy(base_song)
    song["futureSongField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["futureSectionField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["confidence"]["futureConfidenceField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][0]["futureRoleField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][0]["harmony"]["futureHarmonyField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][0]["cue"]["futureCueField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][0]["range"]["futureRangeField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][0]["transcription"] = [
        {
            "pitch": "C4",
            "onset": 0.0,
            "offset": 0.5,
            "velocity": 92.0,
            "futureNoteField": True,
        }
    ]
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["roles"][4]["manualOverrides"][0]["futureOverrideField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["partGraph"][0]["futureGraphField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["sections"][0]["timeRange"]["futureRangeField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["exportSummary"]["futureExportField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    _attach_valid_collaboration(song)
    song["collaboration"]["futureCollaborationField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    _attach_valid_collaboration(song)
    song["collaboration"]["assignments"][0]["futureAssignmentField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    _attach_valid_collaboration(song)
    song["collaboration"]["comments"][0]["futureCommentField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    _attach_valid_collaboration(song)
    song["collaboration"]["approvals"][0]["futureApprovalField"] = True
    candidates.append(song)

    song = copy.deepcopy(base_song)
    song["scoreAttachments"] = [
        {"id": "score-1", "fileName": "verse-chart.pdf", "futureScoreField": True}
    ]
    candidates.append(song)

    for candidate in candidates:
        assert _load_candidate(tmp_path, monkeypatch, candidate) is None
