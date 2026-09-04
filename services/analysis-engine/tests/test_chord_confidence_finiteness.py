"""Regression tests for finite-only chord-confidence arithmetic."""

from __future__ import annotations

import warnings

import numpy as np
import pytest

from bandscope_analysis.chords.chord_recognizer import ChordRecognizer


@pytest.mark.parametrize(
    "invalid_value",
    [np.nan, np.inf, -np.inf],
)
def test_non_finite_similarity_confidence_falls_back_without_runtime_warning(
    invalid_value: float,
) -> None:
    """Unknown similarity evidence must yield low confidence without invalid arithmetic."""
    recognizer = ChordRecognizer()
    similarity = np.linspace(0.1, 0.9, 24, dtype=float)
    similarity[5] = invalid_value

    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        assert recognizer._compute_confidence(similarity, best_state=0) == "low"
