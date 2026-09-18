"""Contract for recognized boundary/repetition metrics on normalized structure segments."""

from __future__ import annotations

from fractions import Fraction
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from conftest import load_module


def _adapter() -> ModuleType:
    """Load the repository-owned structure metric adapter."""
    return load_module(
        "scripts/research/evaluate_structure_segmentation_metrics.py",
        "evaluate_structure_segmentation_metrics",
    )


def _segments(*rows: tuple[str, str, str]) -> tuple[SimpleNamespace, ...]:
    """Build protocol-compatible normalized functional segments."""
    return tuple(
        SimpleNamespace(start=Fraction(start), end=Fraction(end), label=label)
        for start, end, label in rows
    )


class _FakeSegmentMetrics:
    """Record the exact mir_eval calls made by the adapter."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def detection(
        self,
        reference_intervals: Any,
        estimated_intervals: Any,
        **kwargs: Any,
    ) -> tuple[float, float, float]:
        self.calls.append(("detection", kwargs))
        window = kwargs["window"]
        if window == 0.5:
            return (0.8, 0.6, 0.6857142857142857)
        return (0.9, 0.75, 0.8181818181818182)

    def deviation(
        self,
        reference_intervals: Any,
        estimated_intervals: Any,
        **kwargs: Any,
    ) -> tuple[float, float]:
        self.calls.append(("deviation", kwargs))
        return (0.12, 0.18)

    def pairwise(
        self,
        reference_intervals: Any,
        reference_labels: Any,
        estimated_intervals: Any,
        estimated_labels: Any,
        **kwargs: Any,
    ) -> tuple[float, float, float]:
        self.calls.append(("pairwise", kwargs))
        return (0.7, 0.8, 0.7466666666666666)


class _FakeMirEval:
    """Minimal versioned mir_eval surface used as a deterministic test boundary."""

    __version__ = "0.8.2"

    def __init__(self) -> None:
        self.segment = _FakeSegmentMetrics()


def test_adapter_pins_mir_eval_082_and_nontrivial_boundary_semantics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Boundary and repetition metrics must use the preregistered exact arguments."""
    module = _adapter()
    backend = _FakeMirEval()
    monkeypatch.setattr(module, "_load_mir_eval", lambda: backend)

    reference = _segments(
        ("0", "10", "intro"),
        ("10", "20", "verse"),
        ("20", "30", "chorus"),
    )
    estimate = _segments(
        ("0", "10.2", "intro"),
        ("10.2", "19.8", "verse"),
        ("19.8", "30", "chorus"),
    )

    result = module.calculate_structure_segmentation_metrics(reference, estimate)

    assert backend.segment.calls == [
        ("detection", {"window": 0.5, "beta": 1.0, "trim": True}),
        ("detection", {"window": 3.0, "beta": 1.0, "trim": True}),
        ("deviation", {"trim": True}),
        ("pairwise", {"frame_size": 0.1, "beta": 1.0}),
    ]
    assert result.boundary_precision_0_5 == pytest.approx(0.8)
    assert result.boundary_recall_0_5 == pytest.approx(0.6)
    assert result.boundary_f_0_5 == pytest.approx(0.6857142857142857)
    assert result.boundary_precision_3_0 == pytest.approx(0.9)
    assert result.boundary_recall_3_0 == pytest.approx(0.75)
    assert result.boundary_f_3_0 == pytest.approx(0.8181818181818182)
    assert result.reference_to_estimate_median_deviation_seconds == pytest.approx(0.12)
    assert result.estimate_to_reference_median_deviation_seconds == pytest.approx(0.18)
    assert result.repetition_pairwise_precision == pytest.approx(0.7)
    assert result.repetition_pairwise_recall == pytest.approx(0.8)
    assert result.repetition_pairwise_f == pytest.approx(0.7466666666666666)


def test_adapter_fails_closed_on_unregistered_mir_eval_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A dependency drift must fail before scientific scores are accepted."""
    module = _adapter()
    backend = _FakeMirEval()
    backend.__version__ = "0.8.3"
    monkeypatch.setattr(module, "_load_mir_eval", lambda: backend)

    segments = _segments(("0", "10", "verse"), ("10", "20", "chorus"))

    with pytest.raises(RuntimeError, match="mir_eval 0.8.2"):
        module.calculate_structure_segmentation_metrics(segments, segments)

    assert backend.segment.calls == []


def test_adapter_rejects_discontinuous_or_duration_mismatched_segments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Metric code must not silently repair malformed scientific segmentations."""
    module = _adapter()
    backend = _FakeMirEval()
    monkeypatch.setattr(module, "_load_mir_eval", lambda: backend)

    reference = _segments(("0", "10", "verse"), ("10", "20", "chorus"))
    gap = _segments(("0", "9", "verse"), ("10", "20", "chorus"))
    shorter = _segments(("0", "10", "verse"), ("10", "19", "chorus"))

    with pytest.raises(ValueError, match="continuous"):
        module.calculate_structure_segmentation_metrics(reference, gap)
    with pytest.raises(ValueError, match="same duration"):
        module.calculate_structure_segmentation_metrics(reference, shorter)

    assert backend.segment.calls == []
