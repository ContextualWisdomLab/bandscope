"""Tests for the section extraction logic and models."""

from bandscope_analysis.sections.extractor import _normalize_label, extract_sections
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


def test_normalize_label() -> None:
    """Verify standard label normalization logic."""
    assert _normalize_label("VERSE 1") == "verse"
    assert _normalize_label("  chorus 2  ") == "chorus"
    assert _normalize_label("pre-chorus") == "pre-chorus"
    assert _normalize_label("UNKNOWN") == "unknown"
    assert _normalize_label("intro") == "intro"
    assert _normalize_label(123) == "123"


def test_extract_sections_normalizes_labels_and_sequence_indexes() -> None:
    """Verify extraction normalizes labels and indexes repeated form labels."""
    arrangement = [
        {"label": "Verse"},
        {"label": "  CHORUS 2  "},
        {"label": "Verse 2"},
        {"label": "PRE-CHORUS"},
        {"label": "Chorus"},
    ]

    result = extract_sections(arrangement)

    assert [section["form_label"] for section in result["sections"]] == [
        "verse",
        "chorus",
        "verse",
        "pre-chorus",
        "chorus",
    ]
    assert [section["id"] for section in result["sections"]] == [
        "verse-1",
        "chorus-1",
        "verse-2",
        "pre-chorus-1",
        "chorus-2",
    ]


def test_extract_sections_empty() -> None:
    """Verify behavior with an empty arrangement."""
    result = extract_sections([])
    assert result["strategy_used"] == "count"
    assert len(result["sections"]) == 0


def test_extract_sections_missing_label() -> None:
    """Verify behavior when a section is missing the label key."""
    arrangement = [{"groove": "standard"}]
    result = extract_sections(arrangement)
    assert len(result["sections"]) == 1
    assert result["sections"][0]["form_label"] == "unknown"
    assert result["sections"][0]["id"] == "unknown-1"
