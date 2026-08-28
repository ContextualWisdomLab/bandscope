"""Tests for corroborated fermata-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.api import (
    _apply_fermata,
    _coerce_beat_times,
    build_demo_rehearsal_song,
)
from bandscope_analysis.temporal.fermata import (
    _interval_near_median,
    _is_named_vocal_or_bass,
    apply_fermata_plan,
    derive_beat_times,
    fermata_plan_copy,
    first_fermata,
    format_fermata_hold,
    is_fermata_hold,
)

_FERMATA_PLAN = (
    "Hold this part through the extra 1 s; wait for the cutoff before the next entrance."
)


def _beats_with_fermata() -> list[float]:
    """Return beat times with one isolated extra hold after a steady 80 BPM pulse."""
    beats = [index * 0.75 for index in range(16)]
    beats.append(beats[-1] + 1.75)
    for _ in range(8):
        beats.append(beats[-1] + 0.75)
    return beats


def _beats_80_to_120() -> list[float]:
    """Return beat times that lift from 80 BPM to 120 BPM around 11.25s."""
    beats = [i * 0.75 for i in range(16)]
    for _ in range(16):
        beats.append(beats[-1] + 0.5)
    return beats


def _beats_steady() -> list[float]:
    """Return a steady 80 BPM grid with no isolated hold."""
    return [index * 0.75 for index in range(24)]


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
    """Return a one-section song that can receive a fermata stamp."""
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


def test_format_fermata_hold_tokens() -> None:
    """Whole-second holds drop the decimal; unusable values stay unnamed."""
    assert format_fermata_hold(1.0) == "1"
    assert format_fermata_hold(1.5) == "1.5"
    assert format_fermata_hold(0) is None
    assert format_fermata_hold(0.1) is None
    assert format_fermata_hold(0.25) is None
    assert format_fermata_hold(9.0) is None
    assert format_fermata_hold(float("nan")) is None
    assert format_fermata_hold(float("inf")) is None
    assert _interval_near_median(1.0, 0.0) is False
    assert _interval_near_median(-1.0, 0.75) is False


def test_fermata_plan_copy_uses_owned_template() -> None:
    """Model copy names the extra hold without inventing other rehearsal plans."""
    assert fermata_plan_copy(1.0) == _FERMATA_PLAN
    assert fermata_plan_copy(0) is None


def test_first_fermata_picks_the_earliest_isolated_hold() -> None:
    """A single extra beat-gap is a fermata; later steady pulse is ignored."""
    hold = first_fermata(_beats_with_fermata())
    assert hold is not None
    assert abs(hold["hold_seconds"] - 1.0) < 1e-9
    assert 10.5 <= hold["time"] <= 12.5


def test_first_fermata_excludes_steady_pulse_and_tempo_change() -> None:
    """A steady pulse or a sustained speeding is not a fermata."""
    assert first_fermata(_beats_steady()) is None
    assert first_fermata(_beats_80_to_120()) is None


def test_first_fermata_excludes_non_isolated_and_out_of_ratio_holds() -> None:
    """Neighboring long gaps and extreme ratios stay unnamed."""
    clustered = [index * 0.75 for index in range(16)]
    clustered.append(clustered[-1] + 1.75)
    clustered.append(clustered[-1] + 1.75)
    for _ in range(8):
        clustered.append(clustered[-1] + 0.75)
    assert first_fermata(clustered) is None

    stretched = [index * 0.75 for index in range(16)]
    stretched.append(stretched[-1] + 3.2)
    for _ in range(8):
        stretched.append(stretched[-1] + 0.75)
    assert first_fermata(stretched) is None

    too_short_extra = [index * 0.1 for index in range(16)]
    too_short_extra.append(too_short_extra[-1] + 0.2)
    for _ in range(8):
        too_short_extra.append(too_short_extra[-1] + 0.1)
    assert first_fermata(too_short_extra) is None

    too_long_extra = [index * 6.0 for index in range(16)]
    too_long_extra.append(too_long_extra[-1] + 15.0)
    for _ in range(8):
        too_long_extra.append(too_long_extra[-1] + 6.0)
    assert first_fermata(too_long_extra) is None


def test_first_fermata_skips_holds_near_tempo_changes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An isolated gap next to a reported tempo change stays unnamed."""

    def _stability(_times: Any) -> dict[str, Any]:
        return {"tempo_changes": [{"time": 11.25, "from_bpm": 80.0, "to_bpm": 120.0}]}

    monkeypatch.setattr(
        "bandscope_analysis.temporal.fermata.analyze_tempo_stability",
        _stability,
    )
    assert first_fermata(_beats_with_fermata()) is None


def test_first_fermata_survives_stability_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Tempo-stability exceptions fail closed to an empty change list, not a crash."""

    def _boom(_times: Any) -> dict[str, Any]:
        raise TypeError("hostile stability")

    monkeypatch.setattr(
        "bandscope_analysis.temporal.fermata.analyze_tempo_stability",
        _boom,
    )
    hold = first_fermata(_beats_with_fermata())
    assert hold is not None
    assert abs(hold["hold_seconds"] - 1.0) < 1e-9


def test_first_fermata_fails_closed_when_hold_validator_rejects(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A candidate that later fails the hold validator stays unnamed."""
    monkeypatch.setattr(
        "bandscope_analysis.temporal.fermata.is_fermata_hold",
        lambda _hold: False,
    )
    assert first_fermata(_beats_with_fermata()) is None


def test_first_fermata_fails_closed_on_malformed_beats() -> None:
    """Malformed beat collections never invent a hold."""
    assert first_fermata(None) is None
    assert first_fermata("beats") is None
    assert first_fermata([0.0, True, 1.5]) is None
    assert first_fermata([0.0, -1.0]) is None
    assert first_fermata([0.0, 0.75, 0.5]) is None
    assert first_fermata([0.0, 0.75]) is None
    assert is_fermata_hold({"time": True, "hold_seconds": 1.0}) is False
    assert is_fermata_hold({"time": 8.0, "hold_seconds": True}) is False
    assert is_fermata_hold({"time": 8.0, "hold_seconds": float("nan")}) is False
    assert is_fermata_hold({"time": -1.0, "hold_seconds": 1.0}) is False
    assert is_fermata_hold({"hold_seconds": 1.0}) is False


def test_apply_stamps_highest_priority_named_vocal() -> None:
    """The named vocal owns the fermata when it outranks bass in the same section."""
    song = _song_with_section()
    apply_fermata_plan(song, _beats_with_fermata())
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    keys = next(role for role in song["sections"][0]["roles"] if role["id"] == "keys-right")
    assert vocal["fermataPlan"] == _FERMATA_PLAN
    assert vocal["fermataPlanSource"] == "model"
    assert vocal["fermataPlanAtSeconds"] == 11.25
    assert "fermataPlan" not in bass
    assert "fermataPlan" not in keys


def test_apply_stamps_bass_when_vocal_is_inactive() -> None:
    """Bass owns the fermata when the vocal is not active in the section."""
    song = _song_with_section(
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []},
            {"role_id": "lead-vocal", "is_active": False, "handoff_to": [], "handoff_from": []},
            {"role_id": "bass-guitar", "is_active": True, "handoff_to": [], "handoff_from": []},
        ]
    )
    apply_fermata_plan(song, _beats_with_fermata())
    bass = next(role for role in song["sections"][0]["roles"] if role["id"] == "bass-guitar")
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert bass["fermataPlan"] == _FERMATA_PLAN
    assert "fermataPlan" not in vocal


def test_apply_stays_unnamed_without_named_vocal_or_bass() -> None:
    """Accompaniment hands never own a fermata plan."""
    song = _song_with_section(
        roles=[_role("keys-right", name="Keyboard 1 Right Hand", role_type="hand")],
        part_graph=[
            {"role_id": "keys-right", "is_active": True, "handoff_to": [], "handoff_from": []}
        ],
    )
    apply_fermata_plan(song, _beats_with_fermata())
    assert all("fermataPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_when_section_does_not_contain_the_hold() -> None:
    """A fermata outside every section window stays unnamed."""
    song = _song_with_section(start=40, end=56)
    apply_fermata_plan(song, _beats_with_fermata())
    assert all("fermataPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_stays_unnamed_on_tempo_change_and_missing_beats() -> None:
    """Sustained speeding, missing beats, and demo topology stay unnamed."""
    song = _song_with_section()
    apply_fermata_plan(song, _beats_80_to_120())
    assert all("fermataPlan" not in role for role in song["sections"][0]["roles"])
    apply_fermata_plan(song, None)
    apply_fermata_plan(song, "beats")  # type: ignore[arg-type]
    demo = build_demo_rehearsal_song({"beat_times": _beats_with_fermata(), "bpm": 80})
    assert demo["id"] == "demo-song"
    assert all(
        "fermataPlan" not in role for section in demo["sections"] for role in section["roles"]
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
    apply_fermata_plan(song, _beats_with_fermata())
    assert all("fermataPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_on_malformed_song_topology() -> None:
    """Malformed sections, ranges, and graph nodes never invent a hold."""
    apply_fermata_plan({"sections": "nope"}, _beats_with_fermata())
    apply_fermata_plan({"sections": [{"timeRange": "nope", "roles": []}]}, _beats_with_fermata())
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": True, "end": 16}
    apply_fermata_plan(song, _beats_with_fermata())
    song = _song_with_section()
    song["sections"][0]["timeRange"] = {"start": 10, "end": True}
    apply_fermata_plan(song, _beats_with_fermata())
    song = _song_with_section()
    song["sections"][0]["roles"] = None
    apply_fermata_plan(song, _beats_with_fermata())
    song = _song_with_section()
    song["sections"][0]["partGraph"] = "graph"
    apply_fermata_plan(song, _beats_with_fermata())
    song = _song_with_section()
    song["sections"][0]["roles"] = [
        "not-a-role",
        _role("bass-guitar", name="Bass Guitar", priority="urgent"),
    ]
    apply_fermata_plan(song, _beats_with_fermata())
    assert _is_named_vocal_or_bass({"id": ""}) is False
    assert _is_named_vocal_or_bass({"id": "choir", "roleType": "vocal"}) is True


def test_apply_fails_closed_when_copy_cannot_be_built(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A corroborated hold without owned copy stays unnamed."""
    song = _song_with_section()
    monkeypatch.setattr(
        "bandscope_analysis.temporal.fermata.fermata_plan_copy",
        lambda *_args, **_kwargs: None,
    )
    apply_fermata_plan(song, _beats_with_fermata())
    assert all("fermataPlan" not in role for role in song["sections"][0]["roles"])


def test_apply_fails_closed_when_song_get_raises() -> None:
    """Hostile song mappings fail closed instead of escaping."""

    class HostileSong(dict[str, Any]):
        """Mapping that raises when sections are read."""

        def get(self, key: str, default: Any = None) -> Any:
            """Raise on sections so apply_fermata_plan must fail closed."""
            if key == "sections":
                raise TypeError("hostile sections")
            return super().get(key, default)

    apply_fermata_plan(HostileSong(), _beats_with_fermata())


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
                return 80.0, np.array([0, 10, 20], dtype=np.int32)

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


def test_coerce_beat_times_and_pipeline_stamp() -> None:
    """Pipeline features stamp a fermata; malformed beat times fall through to mix derivation."""
    assert _coerce_beat_times(None) is None
    assert _coerce_beat_times({"beat_times": []}) is None
    assert _coerce_beat_times({"beat_times": [0.0, True]}) is None
    assert _coerce_beat_times({"beat_times": [0.0, float("nan")]}) is None
    assert _coerce_beat_times({"beat_times": _beats_with_fermata()})[0] == 0.0

    song = _song_with_section()
    mix = np.ones(8, dtype=np.float32)
    _apply_fermata(song, mix, 22050, {"beat_times": _beats_with_fermata()})
    vocal = next(role for role in song["sections"][0]["roles"] if role["id"] == "lead-vocal")
    assert vocal["fermataPlan"] == _FERMATA_PLAN

    unnamed = _song_with_section()
    _apply_fermata(unnamed, np.zeros(0, dtype=np.float32), 22050, {"beat_times": "nope"})
    assert all("fermataPlan" not in role for role in unnamed["sections"][0]["roles"])


def test_pipeline_stamps_fermata_from_provided_beat_times() -> None:
    """Real stem pipeline receives beat times and names the fermata on the map."""
    sr = 8
    duration = 16.0
    audio = np.ones(int(sr * duration), dtype=np.float32)
    song = build_demo_rehearsal_song(
        {
            "stems": {"bass": audio, "other": audio, "vocals": audio},
            "sr": sr,
            "separation": {"duration_seconds": duration, "chunk_count": 1, "notes": "test"},
            "beat_times": _beats_with_fermata(),
        }
    )
    if song["id"] != "analyzed-song":
        pytest.skip("pipeline fell back to arrangement without structural sections")
    stamped = [
        role for section in song["sections"] for role in section["roles"] if role.get("fermataPlan")
    ]
    assert len(stamped) <= 1
    if stamped:
        assert stamped[0]["fermataPlanSource"] == "model"
        assert stamped[0]["fermataPlanAtSeconds"] == 11.25
        assert stamped[0]["id"] in {"lead-vocal", "bass-guitar"}
