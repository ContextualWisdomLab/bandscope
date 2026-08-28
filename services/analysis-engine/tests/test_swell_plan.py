"""Tests for corroborated swell-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import RehearsalRole

_SOLO_PLAN = "Swell this part; grow into the next downbeat."
_PREFIX = "Swell this part with "
_SUFFIX = "; grow into the next downbeat."


def _activity(
    *,
    bass: bool,
    keys_right: bool,
    vocal: bool,
    keys_left: bool = False,
    guitar: bool = False,
    extra: dict[str, bool] | None = None,
) -> dict[str, bool]:
    """Return a complete role-activity map for one section."""
    activity = {
        "bass-guitar": bass,
        "keys-left": keys_left,
        "keys-right": keys_right,
        "lead-vocal": vocal,
        "acoustic-guitar": guitar,
    }
    if extra:
        activity.update(extra)
    return activity


def _energy(
    *,
    bass: float,
    vocal: float,
    other: float = 0.2,
) -> dict[str, float]:
    """Return RMS energy mapped onto rehearsal roles."""
    return {
        "bass-guitar": bass,
        "keys-left": other,
        "keys-right": other,
        "lead-vocal": vocal,
        "acoustic-guitar": other,
    }


def _roles(extractor: RoleExtractor) -> dict[str, RehearsalRole]:
    """Return canonical bass and vocal role fixtures for topology tests."""
    return extractor._build_roles(
        "C#m7",
        {"lowestNote": "C#2", "highestNote": "E3"},
        "C#m7",
        {"lowestNote": "G#3", "highestNote": "C#5"},
    )


def test_activity_swell_emits_solo_plan_for_a_staying_vocal_rise() -> None:
    """A staying vocal that grows 1.8× names the swell without inventing a drop."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.2, vocal=0.5),
        _energy(bass=0.2, vocal=0.2),
    )
    vocal = next(role for role in topology["active_roles"] if role["id"] == "lead-vocal")
    assert vocal["swellPlan"] == _SOLO_PLAN
    assert vocal["swellPlanSource"] == "model"
    assert all("swellPlan" not in role or role["id"] == "lead-vocal" for role in topology["active_roles"])


def test_activity_swell_names_two_named_rises_as_partners() -> None:
    """Vocal and bass growing together point at each other."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.5, vocal=0.5),
        _energy(bass=0.2, vocal=0.2),
    )
    roles_by_id = {role["id"]: role for role in topology["active_roles"]}
    assert roles_by_id["lead-vocal"]["swellPlan"] == f"{_PREFIX}Bass Guitar{_SUFFIX}"
    assert roles_by_id["bass-guitar"]["swellPlan"] == f"{_PREFIX}Lead Vocal{_SUFFIX}"
    assert "swellPlan" not in roles_by_id["keys-right"]


def test_activity_swell_stays_unnamed_without_previous_activity() -> None:
    """The first section cannot be a swell."""
    extractor = RoleExtractor()
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "verse-1",
        _roles(extractor),
        current,
        None,
        None,
        _energy(bass=0.5, vocal=0.5),
        None,
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_on_heuristic_fallback() -> None:
    """Heuristic topology must not invent a swell plan."""
    extractor = RoleExtractor()
    result = extractor.extract([{"id": "intro"}, {"id": "verse-1"}])
    for topology in result["topologies"]:
        assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_for_a_density_fill() -> None:
    """A new entrance is a drop, not a swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=False)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "drop-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.5, vocal=0.5),
        _energy(bass=0.2, vocal=0.0),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_for_a_density_drop() -> None:
    """A thinning hold is a breakdown, not a swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=False, vocal=False)
    topology = extractor._build_activity_topology(
        "breakdown-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.5, vocal=0.0, other=0.0),
        _energy(bass=0.2, vocal=0.2, other=0.2),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_when_ratio_is_too_small() -> None:
    """A small mix lift is not a corroborated swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "mix-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.2, vocal=0.25),
        _energy(bass=0.2, vocal=0.2),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_when_previous_energy_is_silent() -> None:
    """Silence-to-loud is an entrance, not a swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "from-silence-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.2, vocal=0.5),
        _energy(bass=0.2, vocal=0.0),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_does_not_assign_an_other_stem_landing() -> None:
    """The shared other stem may stay in the texture but never owns the swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True, keys_left=True, guitar=True)
    current = _activity(bass=True, keys_right=True, vocal=True, keys_left=True, guitar=True)
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.2, vocal=0.5, other=0.9),
        _energy(bass=0.2, vocal=0.2, other=0.2),
    )
    roles_by_id = {role["id"]: role for role in topology["active_roles"]}
    assert roles_by_id["lead-vocal"]["swellPlan"] == _SOLO_PLAN
    for ambiguous_role_id in ("keys-left", "keys-right", "acoustic-guitar"):
        assert "swellPlan" not in roles_by_id[ambiguous_role_id]


def test_activity_swell_keeps_shared_accompaniment_source_across_role_swap() -> None:
    """A role swap inside the shared other stem does not invent a source change."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=False, vocal=True, guitar=True)
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
        _energy(bass=0.2, vocal=0.5),
        _energy(bass=0.2, vocal=0.2),
    )
    vocal = next(role for role in topology["active_roles"] if role["id"] == "lead-vocal")
    assert vocal["swellPlan"] == _SOLO_PLAN


def test_extract_emits_swell_across_real_stem_boundaries() -> None:
    """Live activity maps pass previous-section energy into swell emission."""
    extractor = RoleExtractor()
    sr = 8
    bass = np.full(sr * 2, 0.4, dtype=np.float32)
    other = np.full(sr * 2, 0.3, dtype=np.float32)
    vocal = np.concatenate(
        [np.full(sr, 0.2, dtype=np.float32), np.full(sr, 0.8, dtype=np.float32)]
    )
    result = extractor.extract(
        [{"id": "verse-1"}, {"id": "chorus-1"}],
        {
            "stems": {"bass": bass, "other": other, "vocals": vocal},
            "sr": sr,
            "boundaries": [(0.0, 1.0), (1.0, 2.0)],
        },
    )
    chorus: dict[str, Any] = result["topologies"][1]
    vocal_role = next(role for role in chorus["active_roles"] if role["id"] == "lead-vocal")
    assert vocal_role.get("swellPlan") == _SOLO_PLAN
    assert all("swellPlan" not in role for role in result["topologies"][0]["active_roles"])


def test_activity_swell_stays_unnamed_when_energy_maps_are_missing() -> None:
    """Activity without RMS evidence cannot name a swell."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
        None,
        None,
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


def test_activity_swell_stays_unnamed_when_partner_has_no_display_name() -> None:
    """A two-named swell without a named partner stays unnamed."""
    extractor = RoleExtractor()
    incomplete = {key: value for key, value in _roles(extractor).items() if key != "vocal"}
    plan = extractor._activity_swell_plan(
        "bass-guitar",
        incomplete,
        _activity(bass=True, keys_right=True, vocal=True),
        _activity(bass=True, keys_right=True, vocal=True),
        _energy(bass=0.5, vocal=0.5),
        _energy(bass=0.2, vocal=0.2),
    )
    assert plan is None


def test_activity_swell_stays_unnamed_when_role_is_inactive() -> None:
    """An inactive role cannot own a swell even if RMS looks louder."""
    extractor = RoleExtractor()
    plan = extractor._activity_swell_plan(
        "lead-vocal",
        _roles(extractor),
        _activity(bass=True, keys_right=True, vocal=False),
        _activity(bass=True, keys_right=True, vocal=True),
        _energy(bass=0.2, vocal=0.5),
        _energy(bass=0.2, vocal=0.2),
    )
    assert plan is None


def test_extract_leaves_swell_unnamed_when_energy_detection_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Energy failures fail closed without dropping activity topology."""
    extractor = RoleExtractor()

    def _boom(*_args: object, **_kwargs: object) -> list[dict[str, float]]:
        """Force energy detection to fail closed."""
        raise RuntimeError("energy unavailable")

    monkeypatch.setattr(
        "bandscope_analysis.roles.extractor.detect_stem_energy",
        _boom,
    )
    sr = 8
    audio = np.ones(sr * 2, dtype=np.float32)
    result = extractor.extract(
        [{"id": "verse-1"}, {"id": "chorus-1"}],
        {
            "stems": {"bass": audio, "other": audio, "vocals": audio},
            "sr": sr,
            "boundaries": [(0.0, 1.0), (1.0, 2.0)],
        },
    )
    assert result["topologies"]
    assert all(
        "swellPlan" not in role
        for topology in result["topologies"]
        for role in topology["active_roles"]
    )
