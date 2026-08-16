"""Regression tests for accuracy-report engine-version provenance."""

from __future__ import annotations

from pathlib import Path

import pytest

from bandscope_analysis.accuracy import read_product_version


def test_missing_or_empty_product_version_fails_closed(tmp_path: Path) -> None:
    """Accuracy evidence must not publish an ``unknown`` engine version."""
    missing_tree = tmp_path / "missing-tree"
    missing_tree.mkdir()
    with pytest.raises(ValueError, match="VERSION"):
        read_product_version(missing_tree)

    empty_tree = tmp_path / "empty-tree"
    empty_tree.mkdir()
    (empty_tree / "VERSION").write_text("   \n", encoding="utf-8")
    with pytest.raises(ValueError, match="VERSION"):
        read_product_version(empty_tree)
