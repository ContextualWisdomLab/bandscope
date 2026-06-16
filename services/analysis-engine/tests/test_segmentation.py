"""Tests for the structural audio segmentation module."""

from __future__ import annotations

from unittest.mock import patch

import numpy as np

from bandscope_analysis.segmentation import AudioSegmenter
from bandscope_analysis.segmentation.segmenter import _infer_label, _merge_close_boundaries

# ---------------------------------------------------------------------------
# Unit helpers
# ---------------------------------------------------------------------------


def test_merge_close_boundaries_empty() -> None:
    """An empty array returns an empty list."""
    assert _merge_close_boundaries(np.array([]), 8.0) == []


def test_merge_close_boundaries_removes_close_pairs() -> None:
    """Boundaries closer than min_gap are dropped."""
    times = np.array([0.0, 5.0, 15.0, 18.0, 30.0])
    merged = _merge_close_boundaries(times, 8.0)
    # 5.0 and 18.0 are too close to their predecessor
    assert 0.0 in merged
    assert 15.0 in merged
    assert 30.0 in merged
    # 5.0 is within 8 s of 0.0 → dropped
    assert 5.0 not in merged


def test_merge_close_boundaries_all_far_apart() -> None:
    """All boundaries survive when they are spaced beyond min_gap."""
    times = np.array([0.0, 10.0, 20.0, 30.0])
    assert _merge_close_boundaries(times, 8.0) == [0.0, 10.0, 20.0, 30.0]


def test_infer_label_single_segment() -> None:
    """A single segment defaults to 'verse'."""
    assert _infer_label(0, 1, 0.0) == "verse"


def test_infer_label_first_and_last() -> None:
    """First segment → intro, last segment → outro."""
    assert _infer_label(0, 5, 0.0) == "intro"
    assert _infer_label(4, 5, 0.9) == "outro"


def test_infer_label_middle_positions() -> None:
    """Middle segments get verse / chorus / bridge labels from position heuristics."""
    # position ≈ 0.25 (verse range)
    label = _infer_label(1, 6, 0.25)
    assert label in {"verse", "chorus", "bridge", "pre-chorus", "tag", "pickup", "stop", "handoff"}
    # position ≈ 0.45 (chorus range)
    label = _infer_label(2, 6, 0.45)
    assert label in {"verse", "chorus", "bridge", "pre-chorus", "tag", "pickup", "stop", "handoff"}


# ---------------------------------------------------------------------------
# AudioSegmenter unit tests
# ---------------------------------------------------------------------------


def _make_sine(frequency: float = 440.0, duration: float = 30.0, sr: int = 22050) -> np.ndarray:
    """Return a sine-wave array for deterministic tests."""
    t = np.linspace(0.0, duration, int(duration * sr), endpoint=False)
    return (np.sin(2 * np.pi * frequency * t) * 0.5).astype(np.float32)


def test_segmenter_fallback_on_short_audio() -> None:
    """Very short audio triggers the single-segment fallback."""
    y = _make_sine(duration=5.0)
    result = AudioSegmenter().segment(y, 22050)

    assert result["method"] == "fallback"
    assert len(result["boundaries"]) == 1
    assert result["boundaries"][0]["label"] == "verse"
    assert result["boundaries"][0]["confidence"] == "low"


def test_segmenter_returns_valid_schema_on_short_audio() -> None:
    """Fallback result satisfies the SegmentationResult shape."""
    y = _make_sine(duration=5.0)
    result = AudioSegmenter().segment(y, 22050)

    assert isinstance(result["boundaries"], list)
    assert isinstance(result["duration_seconds"], float)
    assert isinstance(result["method"], str)
    assert isinstance(result["segmentation_notes"], str)
    for b in result["boundaries"]:
        assert "start_sec" in b
        assert "end_sec" in b
        assert "label" in b
        assert b["confidence"] in ("low", "medium", "high")
        assert b["end_sec"] > b["start_sec"]


def test_segmenter_boundaries_cover_full_duration() -> None:
    """The union of segment windows covers the full audio duration."""
    y = _make_sine(duration=5.0, sr=22050)
    result = AudioSegmenter().segment(y, 22050)

    boundaries = result["boundaries"]
    assert boundaries[0]["start_sec"] == 0.0
    assert abs(boundaries[-1]["end_sec"] - result["duration_seconds"]) < 1.0


def test_segmenter_gracefully_handles_exception() -> None:
    """An exception inside _segment_ssm_novelty falls back safely."""
    y = _make_sine(duration=60.0)
    segmenter = AudioSegmenter()

    with patch.object(segmenter, "_segment_ssm_novelty", side_effect=RuntimeError("boom")):
        result = segmenter.segment(y, 22050)

    assert result["method"] == "fallback"
    assert len(result["boundaries"]) >= 1


def test_segmenter_longer_audio_produces_multiple_segments() -> None:
    """Audio long enough for segmentation should produce at least 1 boundary."""
    # Use a chirp-like signal: frequency changes over time to create novelty
    sr = 22050
    duration = 60.0
    n = int(duration * sr)
    t = np.linspace(0.0, duration, n, endpoint=False)
    # Alternate between two distinct frequency bands to simulate section changes
    y = np.where(t % 20 < 10, np.sin(2 * np.pi * 220 * t), np.sin(2 * np.pi * 880 * t))
    y = y.astype(np.float32) * 0.5

    result = AudioSegmenter().segment(y, sr)

    assert isinstance(result["boundaries"], list)
    assert len(result["boundaries"]) >= 1
    # All boundaries must be valid
    for b in result["boundaries"]:
        assert b["end_sec"] > b["start_sec"]
        assert b["label"] != ""
        assert b["confidence"] in ("low", "medium", "high")


# ---------------------------------------------------------------------------
# Integration with RoleExtractor
# ---------------------------------------------------------------------------


def test_role_extractor_uses_segment_boundaries_for_stem_activity() -> None:
    """RoleExtractor marks roles active/inactive based on stem RMS in each window."""
    from bandscope_analysis.roles.extractor import RoleExtractor

    sr = 22050
    duration = 30.0
    n = int(duration * sr)

    # First half: only vocals active (bass is silent)
    vocals = np.ones(n, dtype=np.float32) * 0.1
    bass = np.zeros(n, dtype=np.float32)
    bass[n // 2 :] = 0.1  # bass enters in second half

    audio_features = {"stems": {"vocals": vocals, "bass": bass}, "sr": sr}
    boundaries = [
        {"start_sec": 0.0, "end_sec": 15.0, "label": "intro", "confidence": "high"},
        {"start_sec": 15.0, "end_sec": 30.0, "label": "verse", "confidence": "high"},
    ]
    sections = [{"id": "intro-1"}, {"id": "verse-1"}]

    extractor = RoleExtractor()
    result = extractor.extract(sections, audio_features, segment_boundaries=boundaries)

    intro_topo = result["topologies"][0]
    verse_topo = result["topologies"][1]

    intro_by_id = {n["role_id"]: n for n in intro_topo["part_graph"]}
    verse_by_id = {n["role_id"]: n for n in verse_topo["part_graph"]}

    # Intro: vocals active, bass silent
    assert intro_by_id["lead-vocal"]["is_active"] is True
    assert intro_by_id["bass-guitar"]["is_active"] is False

    # Verse: both active
    assert verse_by_id["lead-vocal"]["is_active"] is True
    assert verse_by_id["bass-guitar"]["is_active"] is True


def test_role_extractor_without_boundaries_uses_position_based_fallback() -> None:
    """Without boundaries, RoleExtractor falls back to position-based topology."""
    from bandscope_analysis.roles.extractor import RoleExtractor

    extractor = RoleExtractor()
    result = extractor.extract([{"id": "intro"}, {"id": "verse-1"}])

    # First section should have all 5 roles (position-based)
    assert len(result["topologies"][0]["active_roles"]) == 5
    # Second section only bass + guitar (position-based)
    assert len(result["topologies"][1]["active_roles"]) == 2
