"""Tests for corroborated drop-plan emission."""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from bandscope_analysis.roles.extractor import RoleExtractor
from bandscope_analysis.roles.model import RehearsalRole

_SOLO_PLAN = "Hit this drop; come in together when the texture fills."
_PREFIX = "Hit this drop with "
_SUFFIX = "; come in together when the texture fills."


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


def _roles(extractor: RoleExtractor) -> dict[str, RehearsalRole]:
    """Return canonical bass and vocal role fixtures for topology tests."""
    return extractor._build_roles(
        "C#m7",
        {"lowestNote": "C#2", "highestNote": "E3"},
        "C#m7",
        {"lowestNote": "G#3", "highestNote": "C#5"},
    )


def test_activity_drop_emits_solo_plan_for_a_two_to_three_fill() -> None:
    """A thin verse filling to three sources names the entering landing."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=False)
    current = _activity(bass=True, keys_right=True, vocal=True)

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    vocal = next(role for role in topology["active_roles"] if role["id"] == "lead-vocal")
    assert vocal["dropPlan"] == _SOLO_PLAN
    assert vocal["dropPlanSource"] == "model"
    assert all(
        "dropPlan" not in role or role["id"] == "lead-vocal" for role in topology["active_roles"]
    )


def test_activity_drop_names_two_named_entrances_as_partners() -> None:
    """Two named parts entering together point at each other."""
    extractor = RoleExtractor()
    previous = _activity(bass=False, keys_right=True, vocal=False)
    current = _activity(bass=True, keys_right=True, vocal=True)

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    roles_by_id = {role["id"]: role for role in topology["active_roles"]}
    assert roles_by_id["lead-vocal"]["dropPlan"] == f"{_PREFIX}Bass Guitar{_SUFFIX}"
    assert roles_by_id["bass-guitar"]["dropPlan"] == f"{_PREFIX}Lead Vocal{_SUFFIX}"
    assert "dropPlan" not in roles_by_id["keys-right"]


def test_activity_drop_stays_unnamed_without_previous_activity() -> None:
    """The first section cannot be a drop."""
    extractor = RoleExtractor()
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "verse-1",
        _roles(extractor),
        current,
        None,
        None,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_on_heuristic_fallback() -> None:
    """Heuristic topology must not invent a drop plan."""
    extractor = RoleExtractor()
    result = extractor.extract([{"id": "intro"}, {"id": "verse-1"}])
    for topology in result["topologies"]:
        assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_for_a_density_drop() -> None:
    """A staying sparse hold is a breakdown, not a drop."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=False, vocal=False)
    topology = extractor._build_activity_topology(
        "breakdown-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_when_a_previous_source_leaves() -> None:
    """A mixed dropout is not a corroborated full-band arrival."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=False)
    current = _activity(bass=False, keys_right=True, vocal=True, guitar=True)
    topology = extractor._build_activity_topology(
        "mix-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_when_previous_graph_is_already_dense() -> None:
    """Three previous sources are already full-band, so a new entrance is not a drop."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=True, vocal=True)
    current = _activity(bass=True, keys_right=True, vocal=True, guitar=True)
    topology = extractor._build_activity_topology(
        "already-dense-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_when_current_graph_stays_thin() -> None:
    """Two current sources are not a full-band arrival."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=False, vocal=False)
    current = _activity(bass=True, keys_right=False, vocal=True)
    topology = extractor._build_activity_topology(
        "thin-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_stays_unnamed_when_previous_graph_is_empty() -> None:
    """Zero previous sources cannot corroborate a fill after a thin texture."""
    extractor = RoleExtractor()
    previous = _activity(bass=False, keys_right=False, vocal=False)
    current = _activity(bass=True, keys_right=True, vocal=True)
    topology = extractor._build_activity_topology(
        "from-silence-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    assert all("dropPlan" not in role for role in topology["active_roles"])


def test_activity_drop_does_not_assign_an_other_stem_landing() -> None:
    """The shared other stem may corroborate density but never owns the landing."""
    extractor = RoleExtractor()
    previous = _activity(bass=True, keys_right=False, vocal=False)
    current = _activity(bass=True, keys_right=True, vocal=True, keys_left=True, guitar=True)

    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    roles_by_id = {role["id"]: role for role in topology["active_roles"]}
    assert roles_by_id["lead-vocal"]["dropPlan"] == _SOLO_PLAN
    for ambiguous_role_id in ("keys-left", "keys-right", "acoustic-guitar"):
        assert "dropPlan" not in roles_by_id[ambiguous_role_id]


def test_activity_drop_counts_accompaniment_stems_as_one_source() -> None:
    """Keys and acoustic guitar share one accompaniment source for density."""
    extractor = RoleExtractor()
    previous = _activity(
        bass=True,
        keys_right=True,
        vocal=False,
        keys_left=True,
        guitar=True,
    )
    current = _activity(
        bass=True,
        keys_right=True,
        vocal=True,
        keys_left=True,
        guitar=True,
    )
    topology = extractor._build_activity_topology(
        "fill-1",
        _roles(extractor),
        current,
        None,
        previous,
    )
    vocal = next(role for role in topology["active_roles"] if role["id"] == "lead-vocal")
    assert vocal["dropPlan"] == _SOLO_PLAN


def test_extract_emits_drop_across_real_stem_boundaries() -> None:
    """Live activity maps pass previous-section evidence into drop emission."""
    extractor = RoleExtractor()
    sr = 8
    bass = np.concatenate([np.ones(sr, dtype=np.float32), np.ones(sr, dtype=np.float32)])
    other = np.concatenate([np.zeros(sr, dtype=np.float32), np.ones(sr, dtype=np.float32)])
    vocal = np.concatenate([np.zeros(sr, dtype=np.float32), np.ones(sr, dtype=np.float32)])
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
    assert vocal_role.get("dropPlan") == _SOLO_PLAN
    assert result["topologies"][0]["active_roles"]
    assert all("dropPlan" not in role for role in result["topologies"][0]["active_roles"])


def test_activity_drop_stays_unnamed_when_partner_has_no_display_name() -> None:
    """A two-named-entrance fill without a named partner stays unnamed."""
    extractor = RoleExtractor()
    incomplete = {key: value for key, value in _roles(extractor).items() if key != "vocal"}
    plan = extractor._activity_drop_plan(
        "bass-guitar",
        incomplete,
        _activity(bass=True, keys_right=True, vocal=True),
        _activity(bass=False, keys_right=True, vocal=False),
    )
    assert plan is None


def test_activity_drop_stays_unnamed_when_more_than_one_named_partner_enters() -> None:
    """More than two named entrances cannot name a single landing partner."""
    extractor = RoleExtractor()
    plan = extractor._activity_drop_plan(
        "bass-guitar",
        _roles(extractor),
        _activity(
            bass=True,
            keys_right=True,
            vocal=True,
            extra={"drums": True},
        ),
        _activity(bass=False, keys_right=True, vocal=False),
    )
    assert plan is None


def test_activity_drop_stays_unnamed_when_role_is_inactive(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An inactive role cannot own a drop even if source counts look filled."""
    extractor = RoleExtractor()

    def _forced_three_current_sources(_cls: type[RoleExtractor], role_ids: set[str]) -> int:
        """Keep previous density valid while reporting a filled current graph."""
        return 1 if len(role_ids) <= 2 else 3

    monkeypatch.setattr(RoleExtractor, "_source_count", classmethod(_forced_three_current_sources))
    plan = extractor._activity_drop_plan(
        "lead-vocal",
        _roles(extractor),
        _activity(bass=True, keys_right=True, vocal=False),
        _activity(bass=True, keys_right=True, vocal=False),
    )
    assert plan is None
