"""Tests for the range analysis module."""

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
    roles_by_section = {
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
    roles_by_section = {
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
    roles_by_section = {
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


def test_range_analyzer_invalid_section() -> None:
    """Test analyzer handles non-dict sections gracefully."""
    analyzer = RangeAnalyzer()
    result = analyzer.analyze([{"id": "verse-1"}, "invalid"])
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
    roles_by_section = {
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
