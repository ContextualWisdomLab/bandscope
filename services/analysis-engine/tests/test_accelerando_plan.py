"""Tests for corroborated accelerando-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.api import (
    _apply_accelerando,
    _coerce_beat_times,
    build_demo_rehearsal_song,
)
from bandscope_analysis.temporal.accelerando import (
    _is_named_vocal_or_bass,
    accelerando_plan_copy,
    apply_accelerando_plan,
    derive_beat_times,
    first_accelerando,
    format_accelerando_bpm,
    is_accelerando_change,
)
from bandscope_analysis.temporal.stability import analyze_tempo_stability

_ACCEL_PLAN = "Push this part from 80 BPM into 120 BPM; let the next downbeat arrive sooner."


def _beats_80_to_120() -> list[float]:
    """Return beat times that lift from 80 BPM to 120 BPM around 11.25s."""
    beats = [i * 0.75 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.5)
    return beats


def _beats_60_to_120() -> list[float]:
    """Return beat times that jump from 60 BPM to double-time 120 BPM."""
    beats = [i * 1.0 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.5)
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
    """Return a one-section song that can receive an accelerando stamp."""
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


def test_format_accelerando_bpm_tokens() -> None:
    """Whole BPM values drop the decimal; unusable values stay unnamed."""
    assert format_accelerando_bpm(120.0) == "120"
    assert format_accelerando_bpm(96.5) == "96.5"
    assert format_accelerando_bpm(0) is None
    assert format_accelerando_bpm(-12) is None
    assert format_accelerando_bpm(float("nan")) is None
    assert format_accelerando_bpm(float("inf")) is None


def test_accelerando_plan_copy_uses_owned_template() -> None:
    """Model copy names the speeding without inventing other rehearsal plans."""
    assert accelerando_plan_copy(80, 120) == _ACCEL_PLAN
    assert accelerando_plan_copy(0, 80) is None


def test_first_accelerando_picks_the_earliest_speeding() -> None:
    """80 to 120 is an accelerando; later ritardando is ignored."""
    result = analyze_tempo_stability(_beats_80_to_120())
    change = first_accelerando(result["tempo_changes"])
    assert change is not None
    assert abs(change["from_bpm"] - 80.0) < 1.0
    assert abs(change["to_bpm"] - 120.0) < 1.0
    assert 10.5 <= change["time"] <= 12.5


def test_first_accelerando_excludes_double_time() -> None:
    """A 60 to 120 feel flip is double-time, not an accelerando."""
    result = analyze_tempo_stability(_beats_60_to_120())
    assert first_accelerando(result["tempo_changes"]) is None
    assert is_accelerando_change({"time": 8.0, "from_bpm": 60.0, "to_bpm": 120.0}) is False


def test_first_accelerando_excludes_ritardando_and_double_time() -> None:
    """Slowing down, including ritardando and half-time, is not an accelerando."""
    assert is_accelerando_change({"time": 8.0, "from_bpm": 80.0, "to_bpm": 120.0}) is True
    assert is_accelerando_change({"time": 8.0, "from_bpm": 120.0, "to_bpm": 80.0}) is False
    assert is_accelerando_change({"time": 8.0, "from_bpm": 60.0, "to_bpm": 120.0}) is False
    assert first_accelerando([{"time": 8.0, "from_bpm": 60.0, "to_bpm": 120.0}]) is None


def test_first_accelerando_fails_closed_on_malformed_changes() -> None:
    """Malformed tempo-change collections never invent a rit."""
    assert first_accelerando(None) is None
    assert first_accelerando("tempo") is None
    assert first_accelerando([None, "x", {"from_bpm": True, "to_bpm": 80}]) is None
    assert is_accelerando_change({"from_bpm": True, "to_bpm": 80}) is False
    assert is_accelerando_change({"from_bpm": 120, "to_bpm": True}) is False
    assert is_accelerando_change({"from_bpm": 120, "to_bpm": float("nan")}) is False
    assert first_accelerando([{"from_bpm": 80, "to_bpm": 120, "time": True}]) is None
    assert first_accelerando([{"from_bpm": 80, "to_bpm": 120, "time": -1}]) is None
    assert first_accelerando([{"from_bpm": 80, "to_bpm": 120}]) is None
    assert first_accelerando([{"from_bpm": 120, "to_bpm": 80, "time": True}]) is None


def test_apply_stamps_highest_priority_named_vocal() -> None:
    """The named vocal owns the accel when it outranks bass in the same section."""
    song = _song_with_section()
    apply_accelerando_plan(song, _beats_80_to_120())
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    keys = next(role for role in song["sections"][0]["roles"] if role["id"] == "keys-right")
    assert vocal["accelerandoPlan"] == _ACCEL_PLAN
    assert vocal["accelerandoPlanSource"] == "model"
    assert "accelerandoPlan" not in bass
    assert "accelerandoPlan" not in keys


def test_apply_stamps_bass_when_vocal_is_inactive() -> None:
    """Bass owns the accel when the vocal is not active in the section."""
    song = _song_with_section(
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "lead-vocal", "is_active": False, "handoff_to": [], "handoff_from": []},
            {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
        ]
    )
    apply_accelerando_plan(song, _beats_80_to_120())
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert bass["accelerandoPlan"] == _ACCEL_PLAN
    assert "accelerandoPlan" not in vocal


def test_apply_stays_unnamed_without_named_vocal_or_bass() -> None:
    """Accompaniment hands never own an accelerando plan."""
    song = _song_with_section(
        roles=[_role("keys-right", name="Keyboard 1 Right Hand", role_type="hand")],
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []}
        ],
    )
    apply_accelerando_plan(song, _beats_80_to_120())
    assert all("accelerandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_when_section_does_not_contain_the_change() -> None:
    """An accel outside every section window stays unnamed."""
    song = _song_with_section(start=40, end=56)
    apply_accelerando_plan(song, _beats_80_to_120())
    assert all("accelerandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_on_double_time_and_missing_beats() -> None:
    """Double-time, missing beats, and demo topology stay unnamed."""
    song = _song_with_section()
    apply_accelerando_plan(song, _beats_60_to_120())
    assert all("accelerandoPlan" not in role for role in song["sections"][0]["roles"])
    apply_accelerando_plan(song, None)
    apply_accelerando_plan(song, "beats")  # type: ignore[arg-type]
    demo = build_demo_rehearsal_song({"beat_times": _beats_80_to_120(), "bpm": 120})
    assert demo["id"] == "demo-song"
    assert all(
        "accelerandoPlan" not in role for section in demo["sections"] for role in section["roles"]
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
    apply_accelerando_plan(song, _beats_80_to_120())
    assert all("accelerandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_on_malformed_song_topology() -> None:
    """Malformed sections, ranges, and graph nodes never invent a rit."""
    apply_accelerando_plan({"sections": "nope"}, _beats_80_to_120())
    apply_accelerando_plan({"sections": [{"timeRange": "nope", "roles": []}]}, _beats_80_to_120())
    apply_accelerando_plan(
        _song_with_section(),
        _beats_80_to_120(),
        [(0.0,)],  # type: ignore[list-item]
    )
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": True, "end": 16}
    apply_accelerando_plan(song, _beats_80_to_120())
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": 10, "end": True}
    apply_accelerando_plan(song, _beats_80_to_120())
    song = _song_with_section()
    song["sections"][0]["roles"] = None
    apply_accelerando_plan(song, _beats_80_to_120())
    song = _song_with_section()
    song["sections"][0]["partGraph"] = "graph"
    apply_accelerando_plan(song, _beats_80_to_120())
    song = _song_with_section()
    song["sections"][0]["roles"] = [
        "not-a-role",
        _role("bass-guitar", name="Bass Guitar", priority="urgent"),
    ]
    apply_accelerando_plan(song, _beats_80_to_120())
    assert _is_named_vocal_or_bass({"id": ""}) is False
    assert _is_named_vocal_or_bass({"id": "choir", "roleType": "vocal"}) is True


def test_apply_fails_closed_when_copy_cannot_be_built(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A corroborated change without owned copy stays unnamed."""
    song = _song_with_section()
    monkeypatch.setattr(
        "bandscope_analysis.temporal.accelerando.accelerando_plan_copy",
        lambda *_args, **_kwargs: None,
    )
    apply_accelerando_plan(song, _beats_80_to_120())
    assert all("accelerandoPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_when_song_get_raises() -> None:
    """Hostile song mappings fail closed instead of escaping."""

    class HostileSong(dict[str, Any]):
        """Mapping that raises when sections are read."""

        def get(self, key: str, default: Any = None) -> Any:
            """Raise on sections so apply_accelerando_plan must fail closed."""
            if key == "sections":
                raise TypeError("hostile sections")
            return super().get(key, default)

    apply_accelerando_plan(HostileSong(), _beats_80_to_120())


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
    assert _coerce_beat_times({"beat_times": _beats_80_to_120()})[0] == 0.0

    song = _song_with_section()
    mix = np.ones(8, dtype=np.float32)
    _apply_accelerando(song, mix, 22050, {"beat_times": _beats_80_to_120()})
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert vocal["accelerandoPlan"] == _ACCEL_PLAN
    change = first_accelerando(analyze_tempo_stability(_beats_80_to_120())["tempo_changes"])
    assert change is not None
    assert vocal["accelerandoPlanAtSeconds"] == change["time"]

    def fail_if_redecoded(*args: Any, **kwargs: Any) -> list[float] | None:
        raise AssertionError("an empty authoritative beat grid must not be re-decoded")

    with monkeypatch.context() as context:
        context.setattr("bandscope_analysis.api.derive_beat_times", fail_if_redecoded)
        empty_grid_song = _song_with_section()
        _apply_accelerando(empty_grid_song, np.ones(8, dtype=np.float32), 22050, {"beat_times": []})
    assert all("accelerandoPlan" not in role for role in empty_grid_song["sections"][0]["roles"])

    unnamed = _song_with_section()
    _apply_accelerando(unnamed, np.zeros(0, dtype=np.float32), 22050, {"beat_times": "nope"})
    assert all("accelerandoPlan" not in role for role in unnamed["sections"][0]["roles"])


def test_pipeline_uses_unrounded_boundaries_for_accelerando_section() -> None:
    """A fractional structural boundary must not be truncated before section selection."""
    earlier = _song_with_section(start=0, end=11)
    later = _song_with_section(start=11, end=20)
    song = earlier
    song["sections"].extend(later["sections"])

    apply_accelerando_plan(song, _beats_80_to_120(), [(0.0, 11.9), (11.9, 20.0)])

    earlier_vocal = next(
        role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal"
    )
    later_vocal = next(role for role in song["sections"][1]["roles"] if role["id"] == "lead-vocal")
    assert earlier_vocal["accelerandoPlan"] == _ACCEL_PLAN
    assert "accelerandoPlan" not in later_vocal


def test_apply_accelerando_reuses_provided_beat_times(monkeypatch: pytest.MonkeyPatch) -> None:
    """Provided temporal features avoid a second beat-tracking pass."""

    def fail_if_derived(*args: Any, **kwargs: Any) -> list[float] | None:
        raise AssertionError("beat times should be reused")

    monkeypatch.setattr("bandscope_analysis.api.derive_beat_times", fail_if_derived)
    song = _song_with_section()

    _apply_accelerando(
        song, np.ones(8, dtype=np.float32), 22050, {"beat_times": _beats_80_to_120()}
    )

    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert vocal["accelerandoPlan"] == _ACCEL_PLAN


def test_pipeline_stamps_accelerando_from_provided_beat_times() -> None:
    """Real stem pipeline receives beat times and names the accel on the map."""
    sr = 8
    duration = 16.0
    audio = np.ones(int(sr * duration), dtype=np.float32)
    song = build_demo_rehearsal_song(
        {
            "stems": {"bass": audio, "other": audio, "vocals": audio},
            "sr": sr,
            "separation": {"duration_seconds": duration, "chunk_count": 1, "notes": "test"},
            "beat_times": _beats_80_to_120(),
        }
    )
    if song["id"] != "analyzed-song":
        pytest.skip("pipeline fell back to arrangement without structural sections")
    stamped = [
        role
        for section in song["sections"]
        for role in section["roles"]
        if role.get("accelerandoPlan")
    ]
    assert len(stamped) <= 1
    if stamped:
        assert stamped[0]["accelerandoPlanSource"] == "model"
        assert stamped[0]["id"] in {"lead-vocal", "bass-guitar"}
