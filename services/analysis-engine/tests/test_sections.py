"""Tests for the section extraction logic and models."""

import numpy as np

from bandscope_analysis.sections.extractor import extract_sections, extract_structural_sections
from bandscope_analysis.sections.model import CueAnchorStrategy


def test_extract_sections_with_lyrics() -> None:
    """Verify section extraction behavior when lyrical cues are present."""
    arrangement = [
        {"label": "intro", "groove": "heavy"},
        {"label": "verse 1", "groove": "mellow", "lyric_cue": "hello world"},
        {"label": "chorus 1", "groove": "upbeat", "lyric_cue": "sing it loud"},
        {"label": "Outro"},
    ]

    result = extract_sections(arrangement)

    assert result["strategy_used"] == "lyric"
    sections = result["sections"]
    assert len(sections) == 4

    # Intro
    assert sections[0]["id"] == "intro-1"
    assert sections[0]["form_label"] == "intro"
    assert sections[0]["groove"] == "heavy"
    assert sections[0]["confidence_level"] == "high"
    assert sections[0]["cue_anchor"]["strategy"] == CueAnchorStrategy.COUNT.value

    # Verse
    assert sections[1]["id"] == "verse-1"
    assert sections[1]["form_label"] == "verse"
    assert sections[1]["groove"] == "mellow"
    assert sections[1]["confidence_level"] == "high"
    assert sections[1]["cue_anchor"]["strategy"] == CueAnchorStrategy.LYRIC.value
    assert sections[1]["cue_anchor"]["value"] == "hello world"

    # Chorus
    assert sections[2]["id"] == "chorus-1"
    assert sections[2]["form_label"] == "chorus"
    assert sections[2]["groove"] == "upbeat"
    assert sections[2]["confidence_level"] == "high"
    assert sections[2]["cue_anchor"]["strategy"] == CueAnchorStrategy.LYRIC.value
    assert sections[2]["cue_anchor"]["value"] == "sing it loud"

    # Outro
    assert sections[3]["id"] == "outro-1"
    assert sections[3]["form_label"] == "outro"
    assert sections[3]["groove"] == "standard"
    assert sections[3]["confidence_level"] == "high"
    assert sections[3]["cue_anchor"]["strategy"] == CueAnchorStrategy.COUNT.value


def test_extract_sections_count_based() -> None:
    """Verify section extraction behavior when no lyrical cues are present."""
    arrangement = [{"label": "intro"}, {"label": "verse"}, {"label": "chorus"}]

    result = extract_sections(arrangement)

    assert result["strategy_used"] == "count"
    sections = result["sections"]
    assert len(sections) == 3

    for section in sections:
        assert section["cue_anchor"]["strategy"] == CueAnchorStrategy.COUNT.value
        assert section["cue_anchor"]["value"] == "Enter on beat 1 of bar 1"


def test_extract_sections_unrecognized_label() -> None:
    """Verify section extraction properly tags unrecognized labels with low confidence."""
    arrangement = [{"label": "guitar solo"}, {"label": "random part"}]

    result = extract_sections(arrangement)

    assert result["strategy_used"] == "count"
    sections = result["sections"]

    assert sections[0]["id"] == "guitar solo-1"
    assert sections[0]["form_label"] == "guitar solo"
    assert sections[0]["confidence_level"] == "low"

    assert sections[1]["id"] == "random part-1"
    assert sections[1]["form_label"] == "random part"
    assert sections[1]["confidence_level"] == "low"


def test_extract_structural_sections_uses_novelty_boundaries() -> None:
    """Structural extraction should produce timed boundaries and canonical labels."""
    sr = 100
    stems = {
        "vocals": np.concatenate([np.zeros(300, dtype=np.float32), np.ones(300, dtype=np.float32)]),
        "bass": np.concatenate([np.ones(300, dtype=np.float32), np.zeros(300, dtype=np.float32)]),
        "drums": np.ones(600, dtype=np.float32),
        "other": np.concatenate([np.zeros(300, dtype=np.float32), np.ones(300, dtype=np.float32)]),
    }
    features = {
        "sr": sr,
        "stems": stems,
        "temporal": {
            "bpm": 120.0,
            "beat_times": [i * 0.5 for i in range(13)],
            "downbeat_times": [0.0, 1.5, 3.0, 4.5, 6.0],
            "duration_seconds": 6.0,
            "sample_rate": sr,
            "audio_path": "/tmp/test.wav",
        },
        "chords": [
            {"start_time": 0.0, "end_time": 3.0, "chord": "Am"},
            {"start_time": 3.0, "end_time": 6.0, "chord": "C"},
        ],
    }

    result = extract_structural_sections(features)

    assert result["boundaries"]
    assert len(result["boundaries"]) >= 2
    assert result["extraction"]["sections"][0]["form_label"] == "intro"
    assert result["dominant_chords"][0] in {"Am", "C", "N"}
