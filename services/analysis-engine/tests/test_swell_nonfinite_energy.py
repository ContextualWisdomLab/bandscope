"""Regression tests for fail-closed swell energy validation."""

from __future__ import annotations

import math

import pytest

from bandscope_analysis.roles.extractor import RoleExtractor


def _activity() -> dict[str, bool]:
    """Return a stable section where bass, accompaniment, and vocal all stay active."""
    return {
        "bass-guitar": True,
        "keys-left": False,
        "keys-right": True,
        "lead-vocal": True,
        "acoustic-guitar": False,
    }


def _energy(*, vocal: float) -> dict[str, float]:
    """Return role energy with only vocal varied by the regression."""
    return {
        "bass-guitar": 0.2,
        "keys-left": 0.2,
        "keys-right": 0.2,
        "lead-vocal": vocal,
        "acoustic-guitar": 0.2,
    }


def _roles(extractor: RoleExtractor):
    """Build canonical role fixtures used by the production topology path."""
    return extractor._build_roles(
        "C#m7",
        {"lowestNote": "C#2", "highestNote": "E3"},
        "C#m7",
        {"lowestNote": "G#3", "highestNote": "C#5"},
    )


@pytest.mark.parametrize("current_rms", [math.nan, math.inf])
def test_activity_swell_rejects_nonfinite_current_rms(current_rms: float) -> None:
    """NaN or infinity in current RMS must never manufacture a swell plan."""
    extractor = RoleExtractor()
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        _activity(),
        None,
        _activity(),
        _energy(vocal=current_rms),
        _energy(vocal=0.2),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])


@pytest.mark.parametrize("previous_rms", [math.nan, math.inf])
def test_activity_swell_rejects_nonfinite_previous_rms(previous_rms: float) -> None:
    """NaN or infinity in previous RMS must fail closed symmetrically."""
    extractor = RoleExtractor()
    topology = extractor._build_activity_topology(
        "chorus-1",
        _roles(extractor),
        _activity(),
        None,
        _activity(),
        _energy(vocal=0.5),
        _energy(vocal=previous_rms),
    )
    assert all("swellPlan" not in role for role in topology["active_roles"])
