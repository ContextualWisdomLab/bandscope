"""Naming-contract regression tests for temporal stability internals."""

from __future__ import annotations

import ast
from pathlib import Path


TEMPORAL_STABILITY_MODULE = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "bandscope_analysis"
    / "temporal"
    / "stability.py"
)

LEGACY_UNDERSPECIFIED_IDENTIFIERS = frozenset(
    {
        "after",
        "beats",
        "before",
        "bpms",
        "changes",
        "cv",
        "deviation",
        "entry",
        "flagged",
        "index",
        "intervals",
        "run",
        "ties",
        "window",
    }
)

REQUIRED_SEMANTIC_IDENTIFIERS = frozenset(
    {
        "after_bpm_median",
        "beat_intervals",
        "beat_times_array",
        "before_bpm_median",
        "bpm_variation_coefficient",
        "comparison_window_beats",
        "flagged_boundaries",
        "flagged_boundary",
        "local_bpm_values",
        "relative_bpm_deviation",
        "tempo_change_run",
        "tempo_changes",
        "tied_boundaries",
    }
)


def _module_identifiers(source_text: str) -> set[str]:
    """Return organization-owned Python identifiers declared or referenced by the module."""
    syntax_tree = ast.parse(source_text)
    identifiers = {
        node.id for node in ast.walk(syntax_tree) if isinstance(node, ast.Name)
    }
    identifiers.update(
        node.arg for node in ast.walk(syntax_tree) if isinstance(node, ast.arg)
    )
    return identifiers


def test_temporal_stability_internal_identifiers_are_semantically_specific() -> None:
    """Require bounded-context names instead of generic one-word temporal identifiers."""
    source_text = TEMPORAL_STABILITY_MODULE.read_text(encoding="utf-8")
    identifiers = _module_identifiers(source_text)

    assert not LEGACY_UNDERSPECIFIED_IDENTIFIERS.intersection(identifiers)
    assert REQUIRED_SEMANTIC_IDENTIFIERS.issubset(identifiers)
