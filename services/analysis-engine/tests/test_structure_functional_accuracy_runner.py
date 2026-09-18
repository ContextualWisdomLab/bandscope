"""Parity contract for the pinned MIREX 2025 functional ACC evaluator."""

from __future__ import annotations

from fractions import Fraction
from types import ModuleType

import pytest
from conftest import load_module


def _runner() -> ModuleType:
    """Load the repository-owned functional ACC evaluator adapter."""
    return load_module(
        "scripts/research/evaluate_structure_functional_accuracy.py",
        "evaluate_structure_functional_accuracy",
    )


def _parser() -> ModuleType:
    """Load the canonical preregistered functional-annotation parser."""
    return load_module(
        "scripts/research/parse_structure_functional_annotations.py",
        "parse_structure_functional_annotations_for_acc",
    )


def _segment(start: str, end: str, label: str) -> object:
    """Create one canonical parser-owned functional segment value object."""
    parser = _parser()
    return parser.FunctionalSegment(
        start=Fraction(start),
        end=Fraction(end),
        label=label,
    )


def test_runner_pins_official_mirex_2025_evaluator_identity_and_200ms_grid() -> None:
    """The acceptance runner must not silently drift from the pinned evaluator."""
    runner = _runner()

    assert runner.OFFICIAL_MIREX_2025_EVALUATOR_COMMIT == (
        "b9fa0b0b32e2145af31f35830f78fc9d09a4301b"
    )
    assert runner.FRAME_HOP_SECONDS == 0.2


def test_runner_matches_official_boundary_and_final_partial_frame_semantics() -> None:
    """Exact ends advance to the next segment and a trailing partial grid span counts."""
    runner = _runner()
    reference = (
        _segment("0.0", "0.4", "verse"),
        _segment("0.4", "0.7", "chorus"),
    )
    estimate = (
        _segment("0.0", "0.2", "verse"),
        _segment("0.2", "0.7", "chorus"),
    )

    result = runner.calculate_functional_accuracy(
        reference,
        estimate,
        duration_seconds=Fraction("0.7"),
    )

    assert result.frame_times_seconds == pytest.approx((0.0, 0.2, 0.4, 0.6))
    assert result.total_frames == 4
    assert result.correct_frames == 3
    assert result.accuracy == pytest.approx(0.75)


def test_runner_does_not_add_a_frame_at_exact_track_duration() -> None:
    """The official np.arange grid excludes a frame exactly at the track duration."""
    runner = _runner()
    segments = (
        _segment("0.0", "0.8", "verse"),
    )

    result = runner.calculate_functional_accuracy(
        segments,
        segments,
        duration_seconds=Fraction("0.8"),
    )

    assert result.frame_times_seconds == pytest.approx((0.0, 0.2, 0.4, 0.6))
    assert result.total_frames == 4
    assert result.accuracy == pytest.approx(1.0)


def test_runner_rejects_post_preregistration_mapping_or_incomplete_segments() -> None:
    """Raw `other` labels and discontinuous segments cannot enter the acceptance metric."""
    runner = _runner()
    with pytest.raises(ValueError, match="functional label"):
        runner.calculate_functional_accuracy(
            (_segment("0.0", "0.4", "other"),),
            (_segment("0.0", "0.4", "verse"),),
            duration_seconds=Fraction("0.4"),
        )

    with pytest.raises(ValueError, match="continuous"):
        runner.calculate_functional_accuracy(
            (
                _segment("0.0", "0.2", "verse"),
                _segment("0.3", "0.4", "chorus"),
            ),
            (_segment("0.0", "0.4", "verse"),),
            duration_seconds=Fraction("0.4"),
        )
