"""Integration regression for real decoded-audio stop handoff evidence."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.api import build_demo_rehearsal_song


def _section(section_id: str, label: str, index: int) -> dict[str, object]:
    """Build a deterministic structural section fixture for the pipeline boundary."""
    return {
        "id": section_id,
        "form_label": label,
        "sequence_index": index,
        "groove": "standard",
        "confidence_level": "high",
        "confidence_source": "model",
        "confidence_notes": "Detected from decoded audio.",
        "cue_anchor": {"strategy": "count", "value": "Enter on beat 1"},
    }


def test_real_stem_stop_reaches_rehearsal_song_as_rehearsal_cue_section() -> None:
    """A decoded full-band cut must survive analysis as an actionable stop section."""
    sr = 1_000
    duration_seconds = 10.0
    sample_count = int(sr * duration_seconds)
    time = np.arange(sample_count, dtype=np.float64) / sr
    base = np.sin(2 * np.pi * 20 * time).astype(np.float32)

    bass = base.copy()
    drums = (0.8 * base).astype(np.float32)
    bass[4_000:4_500] = 0.0
    drums[4_000:4_500] = 0.0
    stems = {"bass": bass, "drums": drums}

    detected_sections = [
        _section("verse-1", "verse", 1),
        _section("chorus-1", "chorus", 1),
    ]
    boundaries = [(0.0, 5.0), (5.0, 10.0)]

    with (
        patch(
            "bandscope_analysis.api.segment_with_boundaries",
            return_value=(detected_sections, boundaries),
        ),
        patch("bandscope_analysis.ranges.pitch_tracker.PitchTracker.track", return_value=None),
        patch(
            "bandscope_analysis.chords.chord_recognizer.ChordRecognizer.recognize",
            return_value=[],
        ),
    ):
        song = build_demo_rehearsal_song(
            {
                "stems": stems,
                "sr": sr,
                "separation": {
                    "duration_seconds": duration_seconds,
                    "chunk_count": 1,
                    "notes": "Rights-safe integration fixture",
                },
            }
        )

    assert song["id"] == "analyzed-song"
    assert [section["id"] for section in song["sections"]] == [
        "verse-1",
        "detected-stop-1",
        "chorus-1",
    ]
    stop = song["sections"][1]
    assert stop["label"] == "stop"
    assert stop["timeRange"] == {"start": 4, "end": 5}
    assert stop["confidence"]["source"] == "model"
    assert "full-band quiet interval" in stop["confidence"]["notes"]
