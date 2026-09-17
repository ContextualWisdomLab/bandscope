"""Tests for analysis-engine deprecation-warning visibility policy."""

from __future__ import annotations

import tomllib
from pathlib import Path


def test_pytest_does_not_hide_all_deprecation_warnings() -> None:
    """Require pytest to surface unowned deprecations instead of ignoring them globally."""
    pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
    config = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    filters = config["tool"]["pytest"]["ini_options"].get("filterwarnings", [])

    assert "ignore::DeprecationWarning" not in filters
