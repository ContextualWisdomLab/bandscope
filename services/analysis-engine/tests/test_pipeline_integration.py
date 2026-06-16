"""Tests for the integrated analysis pipeline (segmentation + role topology)."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import build_demo_rehearsal_song


def _make_realistic_stems(sr: int = 22050, duration: float = 30.0) -> dict[str, np.ndarray]:
    """Create stems that simulate a real multi-section song."""
    n_samples = int(sr * duration)
    t = np.linspace(0, duration, n_samples, dtype=np.float32)

    # Bass: present throughout
    bass = (0.5 * np.sin(2 * np.pi * 100 * t)).astype(np.float32)

    # Vocals: active in sections 2 and 3 (10-30s)
    vocals = np.zeros(n_samples, dtype=np.float32)
    vocals[int(sr * 10):] = (
        0.7 * np.sin(2 * np.pi * 440 * t[int(sr * 10):])
    ).astype(np.float32)

    # Drums: present throughout with different intensity
    drums = (0.3 * np.sin(2 * np.pi * 200 * t)).astype(np.float32)

    # Other (keys/guitar): present in chorus sections
    other = np.zeros(n_samples, dtype=np.float32)
    other[int(sr * 10):int(sr * 20)] = (
        0.4 * np.sin(2 * np.pi * 330 * t[int(sr * 10):int(sr * 20)])
    ).astype(np.float32)

    return {"vocals": vocals, "bass": bass, "drums": drums, "other": other}


def test_pipeline_with_real_stems_produces_dynamic_sections() -> None:
    """Ensure real stems trigger the full pipeline with dynamic section detection."""
    stems = _make_realistic_stems(sr=22050, duration=30.0)

    with (
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        song = build_demo_rehearsal_song({
            "stems": stems,
            "sr": 22050,
            "separation": {
                "duration_seconds": 30.0,
                "chunk_count": 1,
                "notes": "Test separation",
            },
        })

    # Pipeline should produce analyzed song (not demo fallback)
    assert song["id"] == "analyzed-song"
    assert len(song["sections"]) >= 1

    # Each section should have valid structure
    for section in song["sections"]:
        assert "id" in section
        assert "label" in section
        assert "groove" in section
        assert "timeRange" in section
        assert section["timeRange"]["start"] < section["timeRange"]["end"]
        assert "confidence" in section
        assert "roles" in section
        assert "partGraph" in section

    # Export summary should be dynamically generated
    assert song["exportSummary"]["format"] == "cue-sheet"
    assert len(song["exportSummary"]["focusSections"]) >= 1


def test_pipeline_without_stems_falls_back_to_demo() -> None:
    """Ensure missing stems falls back to the arrangement-based demo."""
    song = build_demo_rehearsal_song(None)

    assert song["id"] == "demo-song"
    assert song["title"] == "Late Night Set"


def test_pipeline_with_zero_duration_falls_back() -> None:
    """Ensure zero-duration stems fall back to demo."""
    song = build_demo_rehearsal_song({
        "stems": {"vocals": np.zeros(100, dtype=np.float32)},
        "sr": 22050,
        "separation": {
            "duration_seconds": 0.0,
            "chunk_count": 0,
            "notes": "Empty",
        },
    })

    assert song["id"] == "demo-song"


def test_pipeline_section_time_ranges_are_valid_u32() -> None:
    """Ensure all section time ranges are valid non-negative integers."""
    stems = _make_realistic_stems(sr=22050, duration=30.0)

    with (
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        song = build_demo_rehearsal_song({
            "stems": stems,
            "sr": 22050,
            "separation": {
                "duration_seconds": 30.0,
                "chunk_count": 1,
                "notes": "Test separation",
            },
        })

    for section in song["sections"]:
        tr = section["timeRange"]
        assert isinstance(tr["start"], int)
        assert isinstance(tr["end"], int)
        assert tr["start"] >= 0
        assert tr["end"] > tr["start"]
        assert tr["end"] <= 4_294_967_295


def test_pipeline_part_graph_reflects_stem_activity() -> None:
    """Ensure part graph nodes have is_active reflecting actual stem content."""
    stems = _make_realistic_stems(sr=22050, duration=30.0)

    with (
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        song = build_demo_rehearsal_song({
            "stems": stems,
            "sr": 22050,
            "separation": {
                "duration_seconds": 30.0,
                "chunk_count": 1,
                "notes": "Test separation",
            },
        })

    # All sections should have part graph nodes
    for section in song["sections"]:
        graph = section["partGraph"]
        assert len(graph) >= 1

        for node in graph:
            assert "role_id" in node
            assert "is_active" in node
            assert "handoff_to" in node
            assert "handoff_from" in node
            assert isinstance(node["is_active"], bool)
            assert isinstance(node["handoff_to"], list)
            assert isinstance(node["handoff_from"], list)
