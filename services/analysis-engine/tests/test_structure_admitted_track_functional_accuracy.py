"""Contract for paired functional ACC on the exact admitted PCM handoff."""

from __future__ import annotations

import hashlib
import struct
from fractions import Fraction
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest
from conftest import load_module


def _consumer_module() -> ModuleType:
    """Load the repository-owned admitted-track functional ACC consumer."""
    return load_module(
        "scripts/research/evaluate_admitted_structure_track.py",
        "evaluate_admitted_structure_track",
    )


def _segments(*rows: tuple[str, str, str]) -> tuple[SimpleNamespace, ...]:
    """Build protocol-compatible functional segments without copying production types."""
    return tuple(
        SimpleNamespace(start=Fraction(start), end=Fraction(end), label=label)
        for start, end, label in rows
    )


def test_consumer_scores_baseline_and_candidate_on_the_same_admitted_pcm() -> None:
    """Both feature lanes must consume the exact read-only PCM handed off by admission."""
    module = _consumer_module()
    pcm = memoryview(struct.pack("<8f", *([0.0] * 8)))
    annotation = memoryview(b"0.0\t0.4\tverse\n0.4\t0.8\tchorus\n")
    observed: list[tuple[str, memoryview, int, Fraction]] = []

    def baseline_segmenter(
        decoded_pcm: memoryview,
        sample_rate_hz: int,
        duration_seconds: Fraction,
    ) -> tuple[SimpleNamespace, ...]:
        """Return the baseline segmentation while recording the exact input identity."""
        observed.append(("baseline", decoded_pcm, sample_rate_hz, duration_seconds))
        return _segments(("0.0", "0.4", "verse"), ("0.4", "0.8", "chorus"))

    def candidate_segmenter(
        decoded_pcm: memoryview,
        sample_rate_hz: int,
        duration_seconds: Fraction,
    ) -> tuple[SimpleNamespace, ...]:
        """Return a known candidate segmentation on the same immutable signal."""
        observed.append(("candidate", decoded_pcm, sample_rate_hz, duration_seconds))
        return _segments(("0.0", "0.2", "verse"), ("0.2", "0.8", "chorus"))

    consumer = module.PairedFunctionalAccuracyTrackConsumer(
        baseline_segmenter=baseline_segmenter,
        candidate_segmenter=candidate_segmenter,
    )
    consumer("track-01", pcm, annotation, 10)

    assert [name for name, *_ in observed] == ["baseline", "candidate"]
    assert all(view is pcm for _, view, _, _ in observed)
    assert all(view.readonly for _, view, _, _ in observed)
    assert all(sample_rate == 10 for _, _, sample_rate, _ in observed)
    assert all(duration == Fraction(4, 5) for _, _, _, duration in observed)

    evidence = consumer.evidence
    assert len(evidence) == 1
    assert evidence[0].track_id == "track-01"
    assert evidence[0].decoded_pcm_sha256 == hashlib.sha256(pcm).hexdigest()
    assert evidence[0].annotation_sha256 == hashlib.sha256(annotation).hexdigest()
    assert evidence[0].decoded_frames == 8
    assert evidence[0].sample_rate_hz == 10
    assert evidence[0].baseline_accuracy == pytest.approx(1.0)
    assert evidence[0].candidate_accuracy == pytest.approx(0.75)
    assert evidence[0].baseline_total_frames == 4
    assert evidence[0].candidate_total_frames == 4


def test_registered_hypothesis_factory_binds_exact_cqt_then_stft_lanes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The canonical experiment factory must not leave feature identity to callers."""
    module = _consumer_module()
    requested: list[str] = []

    def lane(feature: str) -> Any:
        requested.append(feature)

        def segmenter(
            _pcm: memoryview,
            _sample_rate: int,
            _duration: Fraction,
        ) -> tuple[SimpleNamespace, ...]:
            return _segments(("0.0", "0.4", "verse"))

        return segmenter

    monkeypatch.setattr(module._LANES, "repository_structure_segmenter", lane)

    consumer = module.PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()

    assert isinstance(consumer, module.PairedFunctionalAccuracyTrackConsumer)
    assert requested == ["cqt", "stft"]


def test_consumer_fails_closed_before_measurement_on_mutable_or_malformed_pcm() -> None:
    """The measurement boundary must not accept mutable or non-float32-shaped handoffs."""
    module = _consumer_module()
    calls: list[str] = []

    def should_not_run(*_args: Any) -> tuple[SimpleNamespace, ...]:
        """Record an invalid call if admission-shape checks fail to run first."""
        calls.append("called")
        return _segments(("0.0", "0.4", "verse"))

    consumer = module.PairedFunctionalAccuracyTrackConsumer(
        baseline_segmenter=should_not_run,
        candidate_segmenter=should_not_run,
    )
    annotation = memoryview(b"0.0\t0.4\tverse\n")

    with pytest.raises(ValueError, match="read-only"):
        consumer("track-01", memoryview(bytearray(16)), annotation, 10)
    with pytest.raises(ValueError, match="float32"):
        consumer("track-01", memoryview(b"abc"), annotation, 10)

    assert calls == []
    assert consumer.evidence == ()


def test_consumer_rejects_duplicate_track_measurement_identity() -> None:
    """A registered track must not be counted twice in paired evidence."""
    module = _consumer_module()
    pcm = memoryview(struct.pack("<4f", *([0.0] * 4)))
    annotation = memoryview(b"0.0\t0.4\tverse\n")

    def same_segmenter(
        _decoded_pcm: memoryview,
        _sample_rate_hz: int,
        _duration_seconds: Fraction,
    ) -> tuple[SimpleNamespace, ...]:
        """Return one complete normalized segment."""
        return _segments(("0.0", "0.4", "verse"))

    consumer = module.PairedFunctionalAccuracyTrackConsumer(
        baseline_segmenter=same_segmenter,
        candidate_segmenter=same_segmenter,
    )
    consumer("track-01", pcm, annotation, 10)

    with pytest.raises(ValueError, match="already measured"):
        consumer("track-01", pcm, annotation, 10)

    assert len(consumer.evidence) == 1
