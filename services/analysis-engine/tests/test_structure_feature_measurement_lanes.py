"""Contracts for repository-owned CQT/STFT structure-measurement lanes."""

from __future__ import annotations

import struct
from fractions import Fraction
from types import ModuleType
from typing import Any

import numpy as np
import pytest
from conftest import load_module

from bandscope_analysis.sections import segmenter


def _lane_module() -> ModuleType:
    """Load the repository-owned admitted-PCM structure feature lanes."""
    return load_module(
        "scripts/research/measure_structure_feature_lanes.py",
        "measure_structure_feature_lanes",
    )


def test_research_lanes_bind_cqt_and_stft_without_reopening_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The paired hypothesis must differ only by the registered chroma representation."""
    module = _lane_module()
    pcm = memoryview(struct.pack("<8f", *([0.0] * 8)))
    observed: list[tuple[str, int, float, bool, int]] = []

    def fake_segment_with_boundaries(
        audio: np.ndarray[Any, np.dtype[np.float32]],
        sr: int,
        duration: float | None = None,
        *,
        chroma_feature: str = "cqt",
    ) -> tuple[list[dict[str, Any]], list[tuple[float, float]]]:
        assert duration is not None
        observed.append(
            (chroma_feature, sr, duration, bool(audio.flags.writeable), audio.size)
        )
        return (
            [
                {"form_label": "verse"},
                {"form_label": "chorus"},
            ],
            [(0.0, 0.4), (0.4, 0.8)],
        )

    monkeypatch.setattr(segmenter, "segment_with_boundaries", fake_segment_with_boundaries)

    baseline = module.repository_structure_segmenter("cqt")
    candidate = module.repository_structure_segmenter("stft")
    baseline_segments = baseline(pcm, 10, Fraction(4, 5))
    candidate_segments = candidate(pcm, 10, Fraction(4, 5))

    assert [segment.label for segment in baseline_segments] == ["verse", "chorus"]
    assert [segment.label for segment in candidate_segments] == ["verse", "chorus"]
    assert [(segment.start, segment.end) for segment in baseline_segments] == [
        (Fraction(0), Fraction(2, 5)),
        (Fraction(2, 5), Fraction(4, 5)),
    ]
    assert observed == [
        ("cqt", 10, 0.8, False, 8),
        ("stft", 10, 0.8, False, 8),
    ]


def test_research_lane_rejects_unregistered_feature() -> None:
    """Scientific feature identity must be closed-world before candidate results exist."""
    module = _lane_module()

    with pytest.raises(ValueError, match="registered chroma feature"):
        module.repository_structure_segmenter("cens")


def test_segmenter_feature_selector_controls_boundary_and_repetition_chroma(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One selected representation must drive both boundary and repetition semantics."""
    audio = np.zeros(8192, dtype=np.float32)
    calls: list[str] = []
    chroma = np.ones((12, 128), dtype=np.float64)

    def fake_cqt(**_kwargs: Any) -> np.ndarray[Any, np.dtype[np.float64]]:
        calls.append("cqt")
        return chroma

    def fake_stft(**_kwargs: Any) -> np.ndarray[Any, np.dtype[np.float64]]:
        calls.append("stft")
        return chroma

    monkeypatch.setattr(segmenter.librosa.feature, "chroma_cqt", fake_cqt)
    monkeypatch.setattr(segmenter.librosa.feature, "chroma_stft", fake_stft)
    monkeypatch.setattr(
        segmenter.librosa.segment,
        "recurrence_matrix",
        lambda *_args, **_kwargs: np.eye(128, dtype=np.float64),
    )
    monkeypatch.setattr(
        segmenter,
        "_checkerboard_novelty",
        lambda _ssm: np.zeros(128, dtype=np.float64),
    )

    segmenter.compute_novelty_curve(audio, 8_000, chroma_feature="stft")
    segmenter._segment_repetition_groups(
        audio,
        8_000,
        [0.0],
        1.024,
        chroma_feature="stft",
    )

    assert calls == ["stft", "stft"]


def test_public_segmenter_propagates_one_feature_to_boundary_and_repetition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The public paired lane must not split STFT boundaries from CQT repetition labels."""
    audio = np.zeros(160_000, dtype=np.float32)
    observed: list[tuple[str, str]] = []

    def fake_boundaries(
        _audio: np.ndarray[Any, np.dtype[np.float32]],
        _sr: int,
        _duration: float,
        *,
        chroma_feature: str = "cqt",
    ) -> list[float]:
        observed.append(("boundary", chroma_feature))
        return [0.0, 10.0]

    def fake_groups(
        _audio: np.ndarray[Any, np.dtype[np.float32]],
        _sr: int,
        _boundaries: list[float],
        _duration: float,
        *,
        chroma_feature: str = "cqt",
    ) -> list[int]:
        observed.append(("repetition", chroma_feature))
        return [0, 0]

    monkeypatch.setattr(segmenter, "_compute_boundaries", fake_boundaries)
    monkeypatch.setattr(segmenter, "_segment_repetition_groups", fake_groups)

    sections, boundaries = segmenter.segment_with_boundaries(
        audio,
        8_000,
        duration=20.0,
        chroma_feature="stft",
    )

    assert observed == [("boundary", "stft"), ("repetition", "stft")]
    assert boundaries == [(0.0, 10.0), (10.0, 20.0)]
    assert [section["form_label"] for section in sections] == ["chorus", "chorus"]
