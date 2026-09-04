"""Tests for corroborated breakdown-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import RehearsalRole

_SOLO_PLAN = "Hold this breakdown; keep it sparse until the drop."
_PREFIX = "Hold this breakdown with "
_SUFFIX = "; keep it sparse until the drop."


def _activity(
    *,
    bass: bool,
    keys_right: bool,
    vocal: bool,
    keys_left: bool = False,
    guitar: bool = False,
) -> dict[str, bool]:
    """Return a complete role-activity map for one section."""
    return {
        "bass-guitar": bass,
        "keys-left": keys_left,
        "keys-right": keys_right,
        "lead-vocal": vocal,
        "acoustic-guitar": guitar,
    }


def _roles(extractor: RoleExtractor) -> dict[str, RehearsalRole]:
    """Return canonical bass and vocal role fixtures for topology tests."""
    return extractor._build_roles(
        "C#m7",
        {"lowestNote": "C#2", "highestNote": "E3"},
        "C#m7",
        {"lowestNote": "G#3", "highestNote": "C#5"},
    )


def test_activity_breakdown_emits_solo_plan_for_a_three_to_one_drop() -> None:
    """A dense verse dropping to one staying source names the sparse hold."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=False, vocal=False)

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    bass = next(role for role in topology["active_roles"] if role["id"] == "bass-guitar")
    assert bass["breakdownPlan"] == _SOLO_PLAN
    assert bass["breakdownPlanSource"] == "model"
    assert all(
        "breakdownPlan" not in role or role["id"] == "bass-guitar"
        for role in topology["active_roles"]
    )


def test_activity_breakdown_names_ambiguous_accompaniment_without_assigning_a_part() -> None:
    """A shared other stem may corroborate a partner source but not a named part owner."""
    extractor = RoleExtractor()
    previous = _activity(
        bass=True,
        keys_right=True,
        vocal=True,
        keys_left=True,
        guitar=True,
    )
    current = _activity(
        bass=True,
        keys_right=True,
        vocal=False,
        keys_left=True,
        guitar=True,
    )

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    roles_by_id = {role["id"]: role for role in topology["active_roles"]}
    assert roles_by_id["bass-guitar"]["breakdownPlan"] == f"{_PREFIX}Accompaniment{_SUFFIX}"
    for ambiguous_role_id in ("keys-left", "keys-right", "acoustic-guitar"):
        assert "breakdownPlan" not in roles_by_id[ambiguous_role_id]


def test_activity_breakdown_stays_unnamed_when_only_ambiguous_other_source_holds() -> None:
    """The shared other stem cannot prove which keyboard or guitar part owns the hold."""
    extractor = RoleExtractor()
    previous = _activity(
        bass=True,
        keys_right=True,
        vocal=True,
        keys_left=True,
        guitar=True,
    )
    current = _activity(
        bass=False,
        keys_right=True,
        vocal=False,
        keys_left=True,
        guitar=True,
    )

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert topology["active_roles"]
    assert all("breakdownPlan" not in role for role in topology["active_roles"])


def test_activity_breakdown_stays_unnamed_without_previous_activity() -> None:
    """The first section cannot be a breakdown."""
    extractor = RoleExtractor()
    current = _activity(bass=True, keys_right=False, vocal=False)
    topology = extractor._build_activity_topology(
        "verse-1",
        _roles(extractor),
        current,
        None,
        None,
    )
    assert all("breakdownPlan" not in role for role in topology["active_roles"])


def test_activity_breakdown_stays_unnamed_on_heuristic_fallback() -> None:
    """Heuristic topology must not invent a breakdown plan."""
    extractor = RoleExtractor()
    result = extractor.extract([{"id": "intro"}, {"id": "verse-1"}])
    for topology in result["topologies"]:
        assert all("breakdownPlan" not in role for role in topology["active_roles"])


def test_activity_breakdown_stays_unnamed_for_a_full_stop() -> None:
    """Zero remaining sources is a stop, not a breakdown."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=False, keys_right=False, vocal=False)
    topology = extractor._build_activity_topology(
        "stop-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert topology["active_roles"] == []


def test_activity_breakdown_stays_unnamed_when_a_new_entrance_arrives() -> None:
    """A mixed entrance is not a staying sparse hold."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=False, vocal=False, guitar=True)
    topology = extractor._build_activity_topology(
        "mix-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("breakdownPlan" not in role for role in topology["active_roles"])


def test_activity_breakdown_stays_unnamed_when_previous_graph_is_thin() -> None:
    """Two previous sources are not dense enough to name a breakdown."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=False)
    current = _activity(bass=True, keys_right=False, vocal=False)
    topology = extractor._build_activity_topology(
        "thin-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("breakdownPlan" not in role for role in topology["active_roles"])


def test_activity_breakdown_counts_accompaniment_stems_as_one_source() -> None:
    """Keys and acoustic guitar share one accompaniment source for density."""
    extractor = RoleExtractor()
    previous = _activity(
        bass=True,
        keys_right=True,
        vocal=True,
        keys_left=True,
        guitar=True,
    )
    current = _activity(
        bass=True,
        keys_right=False,
        vocal=False,
        keys_left=False,
        guitar=False,
    )
    topology = extractor._build_activity_topology(
        "sparse-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    bass = next(role for role in topology["active_roles"] if role["id"] == "bass-guitar")
    assert bass["breakdownPlan"] == _SOLO_PLAN


def test_extract_emits_breakdown_across_real_stem_boundaries() -> None:
    """Live activity maps pass previous-section evidence into breakdown emission."""
    extractor = RoleExtractor()
    sr = 8
    bass = np.concatenate([np.ones(sr, dtype=np.float32), np.ones(sr, dtype=np.float32)])
    other = np.concatenate([np.ones(sr, dtype=np.float32), np.zeros(sr, dtype=np.float32)])
    vocal = np.concatenate([np.ones(sr, dtype=np.float32), np.zeros(sr, dtype=np.float32)])
    result = extractor.extract(
        [{"id": "verse-1"}, {"id": "chorus-1"}],
        {
            "stems": {"bass": bass, "other": other, "vocals": vocal},
            "sr": sr,
            "boundaries": [(0.0, 1.0), (1.0, 2.0)],
        },
    )
    chorus: dict[str, Any] = result["topologies"][1]
    bass_role = next(role for role in chorus["active_roles"] if role["id"] == "bass-guitar")
    assert bass_role.get("breakdownPlan") == _SOLO_PLAN
    assert result["topologies"][0]["active_roles"]
    assert all("breakdownPlan" not in role for role in result["topologies"][0]["active_roles"])


def test_activity_breakdown_stays_unnamed_when_partner_has_no_display_name() -> None:
    """A two-source hold without a named partner stays unnamed."""
    extractor = RoleExtractor()
    incomplete = {key: value for key, value in _roles(extractor).items() if key != "vocal"}
    plan = extractor._activity_breakdown_plan(
        "bass-guitar",
        incomplete,
        _activity(bass=True, keys_right=False, vocal=True),
        _activity(bass=True, keys_right=True, vocal=True),
    )
    assert plan is None


def test_activity_breakdown_stays_unnamed_when_two_source_partners_are_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A two-source count with no other-source partner stays unnamed."""
    extractor = RoleExtractor()

    def _forced_two_current_sources(_cls: type[RoleExtractor], role_ids: set[str]) -> int:
        """Keep previous density valid while reporting two current sources."""
        return 3 if len(role_ids) >= 3 else 2

    monkeypatch.setattr(RoleExtractor, "_source_count", classmethod(_forced_two_current_sources))
    plan = extractor._activity_breakdown_plan(
        "bass-guitar",
        _roles(extractor),
        _activity(bass=True, keys_right=False, vocal=False),
        _activity(bass=True, keys_right=True, vocal=True),
    )
    assert plan is None
