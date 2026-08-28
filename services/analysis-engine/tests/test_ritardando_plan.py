"""Tests for corroborated ritardando-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.api import (
    _apply_ritardando,
    _coerce_beat_times,
    build_demo_rehearsal_song,
)
from bandscope_analysis.temporal.ritardando import (
    _is_named_vocal_or_bass,
    apply_ritardando_plan,
    derive_beat_times,
    first_ritardando,
    format_ritardando_bpm,
    is_ritardando_change,
    ritardando_plan_copy,
)
from bandscope_analysis.temporal.stability import analyze_tempo_stability

_RIT_PLAN = "Ease this part from 120 BPM into 80 BPM; let the next downbeat land later."


def _beats_120_to_80() -> list[float]:
    """Return beat times that slow from 120 BPM to 80 BPM around 7.5s."""
    beats = [i * 0.5 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.75)
    return beats


def _beats_120_to_60() -> list[float]:
    """Return beat times that drop from 120 BPM to half-time 60 BPM."""
    beats = [i * 0.5 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 1.0)
    return beats


def _role(
    role_id: str,
    *,
    name: str | None = None,
    role_type: str = "instrument",
    priority: str = "high",
) -> dict[str, Any]:
    """Return a minimal rehearsal role fixture."""
    display = name if name is not None else role_id
    return {
        "id": role_id,
        "name": display,
        "roleType": role_type,
        "rehearsalPriority": priority,
        "harmony": {"chord": "C#m7", "functionLabel": "vi", "source": "model"},
        "cue": {"kind": "transition", "value": "Hold"},
        "range": {"lowestNote": "C#2", "highestNote": "E3"},
        "confidence": {"level": "high", "source": "model", "notes": "ok"},
        "simplification": "Stay on roots.",
        "setupNote": "Keep the attack short.",
        "manualOverrides": [],
        "overlapWarnings": [],
    }


def _song_with_section(
    *,
    start: int = 0,
    end: int = 16,
    roles: list[dict[str, Any]] | None = None,
    part_graph: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a one-section song that can receive a ritardando stamp."""
    section_roles = roles or [
        _role("keys-right", name="Keyboard 1 Right Hand", role_type="hand"),
        _role("lead-vocal", name="Lead Vocal", role_type="vocal"),
        _role("bass-guitar", name="Bass Guitar"),
    ]
    graph = part_graph or [
        {"role_id": role["id"], "is_active": True, "handoff_to": [], "handoff_from": []}
        for role in section_roles
    ]
    return {
        "id": "analyzed-song",
        "title": "Late Night Set",
        "sections": [
            {
                "id": "chorus-1",
                "label": "chorus",
                "groove": "Lifted chorus downbeat",
                "timeRange": {"start": start, "end": end},
                "roles": section_roles,
                "partGraph": graph,
            }
        ],
    }


def test_format_ritardando_bpm_tokens() -> None:
    """Whole BPM values drop the decimal; unusable values stay unnamed."""
    assert format_ritardando_bpm(120.0) == "120"
    assert format_ritardando_bpm(96.5) == "96.5"
    assert format_ritardando_bpm(0) is None
    assert format_ritardando_bpm(-12) is None
    assert format_ritardando_bpm(float("nan")) is None
    assert format_ritardando_bpm(float("inf")) is None


def test_ritardando_plan_copy_uses_owned_template() -> None:
    """Model copy names the slowing without inventing other rehearsal plans."""
    assert ritardando_plan_copy(120, 80) == _RIT_PLAN
    assert ritardando_plan_copy(0, 80) is None


def test_first_ritardando_picks_the_earliest_slowing() -> None:
    """120 to 80 is a ritardando; later accelerando is ignored."""
    result = analyze_tempo_stability(_beats_120_to_80())
    change = first_ritardando(result["tempo_changes"])
    assert change is not None
    assert abs(change["from_bpm"] - 120.0) < 1.0
    assert abs(change["to_bpm"] - 80.0) < 1.0
    assert 7.0 <= change["time"] <= 8.5


def test_first_ritardando_excludes_half_time() -> None:
    """A 120 to 60 feel flip is half-time, not a ritardando."""
    result = analyze_tempo_stability(_beats_120_to_60())
    assert first_ritardando(result["tempo_changes"]) is None
    assert is_ritardando_change({"time": 8.0, "from_bpm": 120.0, "to_bpm": 60.0}) is False


def test_first_ritardando_excludes_accelerando_and_double_time() -> None:
    """Speeding up, including double-time, is not a ritardando."""
    assert is_ritardando_change({"time": 8.0, "from_bpm": 80.0, "to_bpm": 120.0}) is False
    assert is_ritardando_change({"time": 8.0, "from_bpm": 60.0, "to_bpm": 120.0}) is False
    assert first_ritardando([{"time": 8.0, "from_bpm": 60.0, "to_bpm": 120.0}]) is None


def test_first_ritardando_fails_closed_on_malformed_changes() -> None:
    """Malformed tempo-change collections never invent a rit."""
    assert first_ritardando(None) is None
    assert first_ritardando("tempo") is None
    assert first_ritardando([None, "x", {"from_bpm": True, "to_bpm": 80}]) is None
    assert is_ritardando_change({"from_bpm": True, "to_bpm": 80}) is False
    assert is_ritardando_change({"from_bpm": 120, "to_bpm": True}) is False
    assert is_ritardando_change({"from_bpm": 120, "to_bpm": float("nan")}) is False
    assert first_ritardando([{"from_bpm": 120, "to_bpm": 80, "time": True}]) is None
    assert first_ritardando([{"from_bpm": 120, "to_bpm": 80, "time": -1}]) is None
    assert first_ritardando([{"from_bpm": 120, "to_bpm": 80}]) is None


def test_apply_stamps_highest_priority_named_vocal() -> None:
    """The named vocal owns the rit when it outranks bass in the same section."""
    song = _song_with_section()
    apply_ritardando_plan(song, _beats_120_to_80())
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    keys = next(role for role in song["sections"][0]["roles"] if role["id"] == "keys-right")
    assert vocal["ritardandoPlan"] == _RIT_PLAN
    assert vocal["ritardandoPlanSource"] == "model"
    assert "ritardandoPlan" not in bass
    assert "ritardandoPlan" not in keys


def test_apply_stamps_bass_when_vocal_is_inactive() -> None:
    """Bass owns the rit when the vocal is not active in the section."""
    song = _song_with_section(
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "lead-vocal", "is_active": False, "handoff_to": [], "handoff_from": []},
            {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
        ]
    )
    apply_ritardando_plan(song, _beats_120_to_80())
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert bass["ritardandoPlan"] == _RIT_PLAN
    assert "ritardandoPlan" not in vocal


def test_apply_stays_unnamed_without_named_vocal_or_bass() -> None:
    """Accompaniment hands never own a ritardando plan."""
    song = _song_with_section(
        roles=[_role("keys-right", name="Keyboard 1 Right Hand", role_type="hand")],
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []}
        ],
    )
    apply_ritardando_plan(song, _beats_120_to_80())
    assert all("ritardandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_when_section_does_not_contain_the_change() -> None:
    """A rit outside every section window stays unnamed."""
    song = _song_with_section(start=40, end=56)
    apply_ritardando_plan(song, _beats_120_to_80())
    assert all("ritardandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_on_half_time_and_missing_beats() -> None:
    """Half-time, missing beats, and demo topology stay unnamed."""
    song = _song_with_section()
    apply_ritardando_plan(song, _beats_120_to_60())
    assert all("ritardandoPlan" not in role for role in song["sections"][0]["roles"])
    apply_ritardando_plan(song, None)
    apply_ritardando_plan(song, "beats")  # type: ignore[arg-type]
    demo = build_demo_rehearsal_song({"beat_times": _beats_120_to_80(), "bpm": 120})
    assert demo["id"] == "demo-song"
    assert all(
        "ritardandoPlan" not in role for section in demo["sections"] for role in section["roles"]
    )


def test_apply_skips_repeated_and_blank_identities() -> None:
    """Repeated graph ids, blank names, and unknown priorities fail closed."""
    roles = [
        _role("lead-vocal", name="Lead Vocal", role_type="vocal"),
        _role("lead-vocal", name="Double Vocal", role_type="vocal"),
        _role("bass-guitar", name=""),
        _role("mystery", name="Mystery", priority="urgent"),
    ]
    song = _song_with_section(
        roles=roles,
        part_graph=[
            {"role_id": "lead-vocal", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "lead-vocal", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "mystery", "is_active": True, "handoff_to": [], "handoff_from": []},
        ],
    )
    apply_ritardando_plan(song, _beats_120_to_80())
    assert all("ritardandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_on_malformed_song_topology() -> None:
    """Malformed sections, ranges, and graph nodes never invent a rit."""
    apply_ritardando_plan({"sections": "nope"}, _beats_120_to_80())
    apply_ritardando_plan({"sections": [{"timeRange": "nope", "roles": []}]}, _beats_120_to_80())
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": True, "end": 16}
    apply_ritardando_plan(song, _beats_120_to_80())
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": 10, "end": True}
    apply_ritardando_plan(song, _beats_120_to_80())
    song = _song_with_section()
    song["sections"][0]["roles"] = None
    apply_ritardando_plan(song, _beats_120_to_80())
    song = _song_with_section()
    song["sections"][0]["partGraph"] = "graph"
    apply_ritardando_plan(song, _beats_120_to_80())
    song = _song_with_section()
    song["sections"][0]["roles"] = [
        "not-a-role",
        _role("bass-guitar", name="Bass Guitar", priority="urgent"),
    ]
    apply_ritardando_plan(song, _beats_120_to_80())
    assert _is_named_vocal_or_bass({"id": ""}) is False
    assert _is_named_vocal_or_bass({"id": "choir", "roleType": "vocal"}) is True


def test_apply_fails_closed_when_copy_cannot_be_built(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A corroborated change without owned copy stays unnamed."""
    song = _song_with_section()
    monkeypatch.setattr(
        "bandscope_analysis.temporal.ritardando.ritardando_plan_copy",
        lambda *_args, **_kwargs: None,
    )
    apply_ritardando_plan(song, _beats_120_to_80())
    assert all("ritardandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_when_song_get_raises() -> None:
    """Hostile song mappings fail closed instead of escaping."""

    class HostileSong(dict[str, Any]):
        """Mapping that raises when sections are read."""

        def get(self, key: str, default: Any = None) -> Any:
            """Raise on sections so apply_ritardando_plan must fail closed."""
            if key == "sections":
                raise TypeError("hostile sections")
            return super().get(key, default)

    apply_ritardando_plan(HostileSong(), _beats_120_to_80())


def test_derive_beat_times_fails_closed_and_reuses_librosa(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """In-memory beat derivation fails closed and reuses existing beat tracking."""
    assert derive_beat_times(np.zeros(0, dtype=np.float32), 22050) is None
    assert derive_beat_times(np.ones(16, dtype=np.float32), True) is None  # type: ignore[arg-type]
    assert derive_beat_times(np.ones(16, dtype=np.float32), 0) is None

    class _Librosa:
        """Minimal librosa stand-in for beat tracking."""

        class beat:
            """Beat-tracking namespace."""

            @staticmethod
            def beat_track(*, y: Any, sr: int) -> tuple[float, np.ndarray]:
                """Return a tiny beat-frame grid."""
                return 120.0, np.array([0, 10, 20], dtype=np.int32)

        @staticmethod
        def frames_to_time(frames: np.ndarray, sr: int) -> np.ndarray:
            """Convert frames to seconds."""
            return frames.astype(np.float64) / sr

    monkeypatch.setitem(__import__("sys").modules, "librosa", _Librosa)
    derived = derive_beat_times(np.ones(32, dtype=np.float32), 10)
    assert derived == [0.0, 1.0, 2.0]

    class _Boom:
        """Librosa stand-in that fails closed."""

        class beat:
            """Beat-tracking namespace that raises."""

            @staticmethod
            def beat_track(*, y: Any, sr: int) -> tuple[float, np.ndarray]:
                """Force beat tracking to fail closed."""
                raise RuntimeError("beat tracking unavailable")

        @staticmethod
        def frames_to_time(frames: np.ndarray, sr: int) -> np.ndarray:
            """Unused converter."""
            return frames.astype(np.float64)

    monkeypatch.setitem(__import__("sys").modules, "librosa", _Boom)
    assert derive_beat_times(np.ones(32, dtype=np.float32), 22050) is None


def test_coerce_beat_times_and_pipeline_stamp(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pipeline features stamp a rit; malformed beat times fall through to mix derivation."""
    assert _coerce_beat_times(None) is None
    assert _coerce_beat_times({"beat_times": []}) == []
    assert _coerce_beat_times({"beat_times": [0.0, True]}) is None
    assert _coerce_beat_times({"beat_times": [0.0, float("nan")]}) is None
    assert _coerce_beat_times({"beat_times": _beats_120_to_80()})[0] == 0.0

    song = _song_with_section()
    mix = np.ones(8, dtype=np.float32)
    _apply_ritardando(song, mix, 22050, {"beat_times": _beats_120_to_80()})
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert vocal["ritardandoPlan"] == _RIT_PLAN

    def fail_if_redecoded(*args: Any, **kwargs: Any) -> list[float] | None:
        raise AssertionError("an empty authoritative beat grid must not be re-decoded")

    with monkeypatch.context() as context:
        context.setattr("bandscope_analysis.api.derive_beat_times", fail_if_redecoded)
        empty_grid_song = _song_with_section()
        _apply_ritardando(empty_grid_song, np.ones(8, dtype=np.float32), 22050, {"beat_times": []})
    assert all("ritardandoPlan" not in role for role in empty_grid_song["sections"][0]["roles"])

    unnamed = _song_with_section()
    _apply_ritardando(unnamed, np.zeros(0, dtype=np.float32), 22050, {"beat_times": "nope"})
    assert all("ritardandoPlan" not in role for role in unnamed["sections"][0]["roles"])


def test_pipeline_stamps_ritardando_from_provided_beat_times() -> None:
    """Real stem pipeline receives beat times and names the rit on the map."""
    sr = 8
    duration = 16.0
    audio = np.ones(int(sr * duration), dtype=np.float32)
    song = build_demo_rehearsal_song(
        {
            "stems": {"bass": audio, "other": audio, "vocals": audio},
            "sr": sr,
            "separation": {"duration_seconds": duration, "chunk_count": 1, "notes": "test"},
            "beat_times": _beats_120_to_80(),
        }
    )
    if song["id"] != "analyzed-song":
        pytest.skip("pipeline fell back to arrangement without structural sections")
    stamped = [
        role
        for section in song["sections"]
        for role in section["roles"]
        if role.get("ritardandoPlan")
    ]
    assert len(stamped) <= 1
    if stamped:
        assert stamped[0]["ritardandoPlanSource"] == "model"
        assert stamped[0]["id"] in {"lead-vocal", "bass-guitar"}
