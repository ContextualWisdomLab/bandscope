"""Tests for the chord analysis module."""

from bandscope_analysis.chords.analyzer import ChordAnalyzer, _infer_key_center
from bandscope_analysis.chords.model import ChordAnalysisResult
from bandscope_analysis.chords.capo import detect_capo_and_tuning

def test_chord_analyzer_empty_sections() -> None:
    """Test analyzer with empty sections list."""
    analyzer = ChordAnalyzer()
    result = analyzer.analyze([])
    assert result["sections"] == []
    assert "0 sections" in result["analysis_notes"]


def test_chord_analyzer_no_roles() -> None:
    """Test analyzer with sections but no role data."""
    analyzer = ChordAnalyzer()
    result = analyzer.analyze([{"id": "verse-1"}, {"id": "chorus-1"}])
    assert len(result["sections"]) == 2
    assert result["sections"][0]["section_id"] == "verse-1"
    assert result["sections"][0]["chords"] == []
    assert result["sections"][0]["key_center"] == "C"
    assert result["sections"][0]["confidence_level"] == "low"


def test_chord_analyzer_with_roles() -> None:
    """Test analyzer extracts chords from role harmony data."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "C#m7", "functionLabel": "vi pedal anchor", "source": "model"}},
            {"harmony": {"chord": "Emaj7", "functionLabel": "Imaj7 color", "source": "model"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"]) == 1
    summary = result["sections"][0]
    assert summary["section_id"] == "verse-1"
    assert len(summary["chords"]) == 2
    assert summary["chords"][0]["chord"] == "C#m7"
    assert summary["chords"][1]["chord"] == "Emaj7"
    assert summary["key_center"] == "C#"
    assert summary["confidence_level"] == "medium"


def test_chord_analyzer_deduplicates_chords() -> None:
    """Test analyzer deduplicates identical chords within a section."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "C#m7", "functionLabel": "vi", "source": "model"}},
            {"harmony": {"chord": "C#m7", "functionLabel": "vi repeated", "source": "model"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"][0]["chords"]) == 1


def test_chord_analyzer_user_source_confidence() -> None:
    """Test that user-sourced chords raise confidence to high."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "Dm", "functionLabel": "ii", "source": "user"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    summary = result["sections"][0]
    assert summary["confidence_level"] == "high"
    assert summary["confidence_source"] == "user"


def test_chord_analyzer_invalid_section() -> None:
    """Test analyzer handles non-dict sections gracefully."""
    analyzer = ChordAnalyzer()
    result = analyzer.analyze([{"id": "verse-1"}, "invalid"])
    assert len(result["sections"]) == 2
    assert result["sections"][0]["section_id"] == "verse-1"
    assert result["sections"][1]["section_id"] == "section-1"


def test_chord_analyzer_missing_section_id() -> None:
    """Test analyzer generates section id when missing."""
    analyzer = ChordAnalyzer()
    result = analyzer.analyze([{}])
    assert result["sections"][0]["section_id"] == "section-0"


def test_chord_analyzer_roles_missing_harmony() -> None:
    """Test analyzer skips roles without harmony data."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"id": "bass", "name": "Bass"},
            {"id": "vocal", "harmony": "not-a-dict"},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert result["sections"][0]["chords"] == []


def test_chord_analyzer_harmony_missing_function_label() -> None:
    """Test analyzer handles harmony without functionLabel."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "G", "source": "model"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert result["sections"][0]["chords"][0]["functionLabel"] == ""


def test_infer_key_center_basic() -> None:
    """Test key center inference from common chords."""
    assert _infer_key_center("C#m7") == "C#"
    assert _infer_key_center("Bb") == "Bb"
    assert _infer_key_center("G") == "G"
    assert _infer_key_center("") == "C"
    assert _infer_key_center("Am") == "A"


def test_chord_analysis_result_structure() -> None:
    """Test that result conforms to ChordAnalysisResult type structure."""
    analyzer = ChordAnalyzer()
    result: ChordAnalysisResult = analyzer.analyze([{"id": "intro-1"}])
    assert "sections" in result
    assert "analysis_notes" in result

def test_detect_capo_standard():
    """Test standard tuning and no capo."""
    result = detect_capo_and_tuning(["G", "D", "Em", "C"])
    assert result["capo"] == 0
    assert result["tuning"] == "Standard"


def test_detect_capo_fret1():
    """Test capo detection for flat keys."""
    result = detect_capo_and_tuning(["Eb", "Bb", "Fm", "Ab"])
    assert result["capo"] == 1
    assert result["tuning"] == "Standard"


def test_detect_capo_empty():
    """Test empty chord list."""
    result = detect_capo_and_tuning([])
    assert result["capo"] is None
    assert result["tuning"] == "Standard"


def test_detect_drop_d():
    """Test drop D tuning."""
    result = detect_capo_and_tuning(["D5", "G5", "A5"])
    assert result["capo"] == 0
    assert result["tuning"] == "Drop D"
