"""Tests for the range analysis module."""

from typing import Any

from bandscope_analysis.ranges.analyzer import (
    RangeAnalyzer,
    _note_to_midi,
    _overlap_severity,
    _parse_note,
    _ranges_overlap,
)
from bandscope_analysis.ranges.model import RangeAnalysisResult


def test_parse_note_basic() -> None:
    """Test basic note parsing."""
    assert _parse_note("C4") == ("C", 4)
    assert _parse_note("G#3") == ("G#", 3)
    assert _parse_note("Bb2") == ("Bb", 2)
    assert _parse_note("") == ("C", 4)


def test_parse_note_without_octave() -> None:
    """Test note parsing without explicit octave."""
    assert _parse_note("C") == ("C", 4)


def test_parse_note_all_digits() -> None:
    """Test note parsing when input is all digits (edge case)."""
    assert _parse_note("4") == ("4", 4)


def test_parse_note_malformed_negative_octave_falls_back() -> None:
    """Test malformed trailing '-' octave inputs fail safely."""
    assert _parse_note("C-") == ("C", 4)
    assert _parse_note("C#-") == ("C#", 4)


def test_note_to_midi() -> None:
    """Test MIDI number conversion for note comparison."""
    assert _note_to_midi("C4") == 60
    assert _note_to_midi("C#4") == 61
    assert _note_to_midi("D4") == 62
    assert _note_to_midi("C5") > _note_to_midi("C4")
    assert _note_to_midi("G#3") < _note_to_midi("C4")


def test_ranges_overlap_true() -> None:
    """Test overlapping ranges are detected."""
    assert _ranges_overlap("C2", "E3", "C#2", "C#3") is True


def test_ranges_overlap_false() -> None:
    """Test non-overlapping ranges are correctly identified."""
    assert _ranges_overlap("C2", "E2", "A4", "C5") is False


def test_overlap_severity_high() -> None:
    """Test high severity overlap detection."""
    # Ranges almost completely overlap
    result = _overlap_severity("C3", "C5", "C3", "C5")
    assert result == "high"


def test_overlap_severity_low() -> None:
    """Test low severity overlap detection."""
    # Ranges barely overlap
    result = _overlap_severity("C2", "G4", "F#4", "C6")
    assert result == "low"


def test_overlap_severity_medium() -> None:
    """Test medium severity overlap detection."""
    # C3-C5 = 24 semitones, A3-G6 = 34 semitones.
    # Overlap is A3-C5 = 15 semitones. ratio = 15/24 ≈ 0.625 -> not medium
    # Need ranges with overlap ratio between 0.25 and 0.5
    # E.g. C3(48)-C5(72) = 24 semitones, A4(69)-A6(93) = 24 semitones
    # Overlap = A4(69)-C5(72) = 3 semitones. ratio = 3/24 = 0.125 -> low
    # Try C3-G4(67) = 19 and E4(64)-G6 = 31. overlap = E4(64)-G4(67) = 3, ratio 3/19=0.15 -> low
    # Try C3-C5(72) = 24, G4(67)-E5(76) = 9. Overlap = G4(67)-C5(72) = 5, ratio 5/9 = 0.55 -> high
    # For medium: 0.25 < ratio <= 0.5. Need overlap/min_range in (0.25, 0.5]
    # C3(48)-C5(72) = 24, A4(69)-C6(84) = 15. Overlap = A4(69)-C5(72)= 3. ratio = 3/15 = 0.2 -> low
    # C3(48)-G5(79)=31, E5(76)-E6(88)=12. Overlap = E5(76)-G5(79)=3. ratio 3/12=0.25 -> low (<=0.25)
    # C3(48)-G5(79)=31, D5(74)-E6(88)=14. Overlap = D5(74)-G5(79)=5. ratio 5/14=0.357 -> medium
    result = _overlap_severity("C3", "G5", "D5", "E6")
    assert result == "medium"


def test_range_analyzer_empty() -> None:
    """Test analyzer with empty sections."""
    analyzer = RangeAnalyzer()
    result = analyzer.analyze([])
    assert result["sections"] == []
    assert "0 sections" in result["analysis_notes"]


def test_range_analyzer_no_roles() -> None:
    """Test analyzer with sections but no role data."""
    analyzer = RangeAnalyzer()
    result = analyzer.analyze([{"id": "verse-1"}])
    assert len(result["sections"]) == 1
    assert result["sections"][0]["ranges"] == []
    assert result["sections"][0]["overlaps"] == []


def test_range_analyzer_with_roles() -> None:
    """Test analyzer extracts ranges from role data."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "verse-1": [
            {
                "id": "bass",
                "name": "Bass Guitar",
                "range": {"lowestNote": "C#2", "highestNote": "E3"},
            },
            {
                "id": "vocal",
                "name": "Lead Vocal",
                "range": {"lowestNote": "G#3", "highestNote": "C#5"},
            },
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"][0]["ranges"]) == 2
    assert result["sections"][0]["ranges"][0]["role_id"] == "bass"
    assert result["sections"][0]["ranges"][1]["role_id"] == "vocal"


def test_range_analyzer_detects_overlap() -> None:
    """Test analyzer detects overlapping ranges."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "verse-1": [
            {"id": "bass", "name": "Bass", "range": {"lowestNote": "C#2", "highestNote": "E3"}},
            {
                "id": "keys-left",
                "name": "Keys Left",
                "range": {"lowestNote": "C#2", "highestNote": "C#3"},
            },
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    overlaps = result["sections"][0]["overlaps"]
    assert len(overlaps) == 1
    assert overlaps[0]["role_a"] == "bass"
    assert overlaps[0]["role_b"] == "keys-left"


def test_range_analyzer_no_overlap() -> None:
    """Test analyzer correctly finds no overlaps when ranges are disjoint."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "verse-1": [
            {
                "id": "bass",
                "name": "Bass",
                "range": {"lowestNote": "C2", "highestNote": "E2"},
            },
            {
                "id": "vocal",
                "name": "Vocal",
                "range": {"lowestNote": "A4", "highestNote": "C6"},
            },
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert result["sections"][0]["overlaps"] == []


def test_range_analyzer_missing_roles() -> None:
    """Test analyzer handles sections gracefully when roles are missing."""
    analyzer = RangeAnalyzer()
    result = analyzer.analyze([{"id": "verse-1"}, {"id": "section-1"}])
    assert len(result["sections"]) == 2
    assert result["sections"][1]["section_id"] == "section-1"


def test_range_analyzer_missing_section_id() -> None:
    """Test analyzer generates section id when missing."""
    analyzer = RangeAnalyzer()
    result = analyzer.analyze([{}])
    assert result["sections"][0]["section_id"] == "section-0"


def test_range_analyzer_role_missing_range() -> None:
    """Test analyzer skips roles without range data."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "verse-1": [
            {"id": "bass", "name": "Bass"},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert result["sections"][0]["ranges"] == []


def test_range_analysis_result_structure() -> None:
    """Test that result conforms to RangeAnalysisResult type structure."""
    analyzer = RangeAnalyzer()
    result: RangeAnalysisResult = analyzer.analyze([{"id": "intro-1"}])
    assert "sections" in result
    assert "analysis_notes" in result


def test_range_analyzer_complex_scenario() -> None:
    """Test analyzer with a complex mix of overlapping, non-overlapping, and invalid ranges."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "verse-1"}, {"id": "chorus-1"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "verse-1": [
            {"id": "bass", "name": "Bass", "range": {"lowestNote": "C2", "highestNote": "C3"}},
            {"id": "guitar", "name": "Guitar", "range": {"lowestNote": "E2", "highestNote": "E4"}},
            {"id": "keys", "name": "Keys", "range": {"lowestNote": "G3", "highestNote": "C5"}},
            {"id": "vocal", "name": "Vocal", "range": {"lowestNote": "A4", "highestNote": "A5"}},
        ],
        "chorus-1": [
            {"id": "drums", "name": "Drums"},  # No range
            {"id": "bass", "name": "Bass", "range": {"lowestNote": "C2", "highestNote": "E3"}},
            {"id": "synth", "name": "Synth", "range": {"lowestNote": "D2", "highestNote": "D3"}},
        ],
    }

    result = analyzer.analyze(sections, roles_by_section)

    # Verse 1 checks
    verse_overlaps = result["sections"][0]["overlaps"]
    # bass overlaps with guitar
    # guitar overlaps with keys
    # vocal overlaps with keys (A4 is lower than C5)
    assert len(verse_overlaps) == 3

    overlap_pairs = [(o["role_a"], o["role_b"]) for o in verse_overlaps]
    assert ("bass", "guitar") in overlap_pairs or ("guitar", "bass") in overlap_pairs
    assert ("guitar", "keys") in overlap_pairs or ("keys", "guitar") in overlap_pairs
    assert ("keys", "vocal") in overlap_pairs or ("vocal", "keys") in overlap_pairs

    # Chorus 1 checks
    chorus_overlaps = result["sections"][1]["overlaps"]
    # bass overlaps with synth
    assert len(chorus_overlaps) == 1
    assert chorus_overlaps[0]["role_a"] in ("bass", "synth")
    assert chorus_overlaps[0]["role_b"] in ("bass", "synth")


def test_range_analyzer_non_overlapping_branch() -> None:
    """Test analyzer with non-overlapping ranges (branch 229 false)."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "test"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "test": [
            # D4 (midi 62) to D4 (62) -> low=62, high=62
            {"id": "role1", "name": "R1", "range": {"lowestNote": "D4", "highestNote": "D4"}},
            # C4 (midi 60) to C4 (60) -> low=60, high=60
            # E4 (midi 64) to E4 (64) -> low=64, high=64
            # We want midi_low_a <= midi_high_b and midi_low_b <= midi_high_a to be FALSE
            # And we need to make sure we don't break at 225
            {"id": "role2", "name": "R2", "range": {"lowestNote": "E4", "highestNote": "E4"}},
            {"id": "role3", "name": "R3", "range": {"lowestNote": "C5", "highestNote": "C5"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"][0]["overlaps"]) == 0


def test_range_analyzer_invalid_range_high_lower_than_low() -> None:
    """Test analyzer with inverted range where lowest > highest, to hit line 229 false condition."""
    analyzer = RangeAnalyzer()
    sections = [{"id": "test"}]
    roles_by_section: dict[str, list[dict[str, Any]]] = {
        "test": [
            # Normal range: low=60, high=64
            {"id": "r1", "name": "R1", "range": {"lowestNote": "C4", "highestNote": "E4"}},
            # Inverted range: low=62, high=58
            # Sorting gives: r1 (60), r2 (62)
            # 225 condition: r2.low (62) > r1.high (64) is FALSE (no break)
            # 229 condition: r1.low (60) <= r2.high (58) is FALSE
            # This makes condition 229 evaluate to FALSE!
            {"id": "r2", "name": "R2", "range": {"lowestNote": "D4", "highestNote": "Bb3"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"][0]["overlaps"]) == 0
