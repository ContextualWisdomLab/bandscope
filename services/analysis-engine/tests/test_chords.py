"""Tests for the chord analysis module."""

from unittest.mock import patch

import numpy as np

from bandscope_analysis.chords.analyzer import ChordAnalyzer, _infer_key_center
from bandscope_analysis.chords.capo import detect_capo_and_tuning
from bandscope_analysis.chords.model import ChordAnalysisResult


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


def test_chord_analyzer_clamps_legacy_role_sources_to_model() -> None:
    """Test legacy role chord extraction always emits model source."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {
                "harmony": {
                    "chord": "F",
                    "functionLabel": "IV",
                    "source": "unexpected",
                }
            },
        ]
    }

    result = analyzer.analyze(sections, roles_by_section)
    assert result["sections"][0]["chords"] == [
        {"chord": "F", "functionLabel": "IV", "source": "model"}
    ]


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
            {"id": "vocal", "harmony": "not-a-dict"},  # type: ignore
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


def test_detect_capo_standard() -> None:
    """Test standard tuning and no capo."""
    result = detect_capo_and_tuning(["G", "D", "Em", "C"])
    assert result["capo"] == 0
    assert result["tuning"] == "Standard"


def test_detect_capo_fret1() -> None:
    """Test capo detection for flat keys."""
    result = detect_capo_and_tuning(["Eb", "Bb", "Fm", "Ab"])
    assert result["capo"] == 1
    assert result["tuning"] == "Standard"


def test_detect_capo_empty() -> None:
    """Test empty chord list."""
    result = detect_capo_and_tuning([])
    assert result["capo"] is None
    assert result["tuning"] == "Standard"


def test_detect_drop_d() -> None:
    """Test drop D tuning."""
    result = detect_capo_and_tuning(["D5", "G5", "A5"])
    assert result["capo"] == 0
    assert result["tuning"] == "Drop D"


def test_chord_analyzer_with_audio_stems() -> None:
    """Test analyzer uses ChordRecognizer when audio stems are provided."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    other_stem = np.ones(sr, dtype=np.float32)
    recognized = [
        {"start_time": 0.0, "end_time": 3.0, "chord": "C", "confidence": "high"},
    ]

    with patch.object(analyzer._recognizer, "recognize", return_value=recognized) as recognize:
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )

    recognize.assert_called_once()
    assert len(result["sections"]) == 1
    summary = result["sections"][0]
    assert summary["chords"] == [{"chord": "C", "functionLabel": "", "source": "model"}]
    assert summary["confidence_level"] == "high"
    assert summary["confidence_source"] == "model"


def test_chord_analyzer_user_overrides_audio() -> None:
    """Test that user-sourced chords override audio-derived chords."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "Am", "functionLabel": "vi", "source": "user"}},
        ]
    }

    result = analyzer.analyze(
        sections,
        roles_by_section=roles_by_section,
        audio_stems={"other": other_stem},
        sample_rate=sr,
    )
    summary = result["sections"][0]
    # User chords should take priority
    assert summary["chords"][0]["chord"] == "Am"
    assert summary["confidence_level"] == "high"
    assert summary["confidence_source"] == "user"


def test_chord_analyzer_empty_stems_fallback() -> None:
    """Test analyzer falls back to role data with empty stems."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "G", "functionLabel": "I", "source": "model"}},
        ]
    }

    result = analyzer.analyze(
        sections,
        roles_by_section=roles_by_section,
        audio_stems={"other": np.array([], dtype=np.float32)},
    )
    summary = result["sections"][0]
    assert summary["chords"][0]["chord"] == "G"


def test_chord_analyzer_recognize_exception() -> None:
    """Test that recognition exceptions are handled gracefully."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 1, sr, endpoint=False)
    other_stem = np.sin(2 * np.pi * 440.0 * t).astype(np.float32)

    with patch.object(analyzer._recognizer, "recognize", side_effect=RuntimeError("fail")):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )
    # Should fall back gracefully with no chords
    assert len(result["sections"]) == 1


def test_chord_analyzer_time_range_filtering() -> None:
    """Test that section time ranges filter recognized chords."""
    analyzer = ChordAnalyzer()
    sr = 22050
    audio = np.ones(sr, dtype=np.float32)
    recognized = [
        {"start_time": 0.0, "end_time": 2.0, "chord": "C", "confidence": "high"},
        {"start_time": 3.1, "end_time": 5.0, "chord": "G", "confidence": "high"},
    ]

    sections = [
        {"id": "verse-1", "timeRange": {"start": 0.0, "end": 3.0}},
        {"id": "chorus-1", "timeRange": {"start": 3.0, "end": 6.0}},
    ]

    with patch.object(analyzer._recognizer, "recognize", return_value=recognized):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": audio},
            sample_rate=sr,
        )

    assert len(result["sections"]) == 2
    assert result["sections"][0]["chords"] == [
        {"chord": "C", "functionLabel": "", "source": "model"}
    ]
    assert result["sections"][1]["chords"] == [
        {"chord": "G", "functionLabel": "", "source": "model"}
    ]


def test_chord_analyzer_dsp_low_confidence() -> None:
    """Test that low-confidence DSP chords produce low confidence level."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    # Mock the recognizer to return chords with low confidence
    mock_chords = [
        {"start_time": 0.0, "end_time": 1.0, "chord": "C", "confidence": "low"},
        {"start_time": 1.0, "end_time": 2.0, "chord": "G", "confidence": "low"},
    ]
    with patch.object(analyzer._recognizer, "recognize", return_value=mock_chords):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )
    summary = result["sections"][0]
    assert summary["confidence_level"] == "low"
    assert summary["confidence_source"] == "model"


def test_chord_analyzer_dsp_medium_confidence() -> None:
    """Test that medium-ratio DSP chords produce medium confidence."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    # Mock: 1 high out of 3 = 33% > 20%, should be medium
    mock_chords = [
        {"start_time": 0.0, "end_time": 1.0, "chord": "C", "confidence": "high"},
        {"start_time": 1.0, "end_time": 1.5, "chord": "G", "confidence": "low"},
        {"start_time": 1.5, "end_time": 2.0, "chord": "Am", "confidence": "low"},
    ]
    with patch.object(analyzer._recognizer, "recognize", return_value=mock_chords):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )
    summary = result["sections"][0]
    assert summary["confidence_level"] == "medium"
    assert summary["confidence_source"] == "model"


def test_chord_analyzer_dsp_high_confidence() -> None:
    """Test that high-ratio DSP chords produce high confidence."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    # Mock: 2 high out of 3 = 67% > 50%, should be high
    mock_chords = [
        {"start_time": 0.0, "end_time": 1.0, "chord": "C", "confidence": "high"},
        {"start_time": 1.0, "end_time": 1.5, "chord": "G", "confidence": "high"},
        {"start_time": 1.5, "end_time": 2.0, "chord": "Am", "confidence": "low"},
    ]
    with patch.object(analyzer._recognizer, "recognize", return_value=mock_chords):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )
    summary = result["sections"][0]
    assert summary["confidence_level"] == "high"
    assert summary["confidence_source"] == "model"


def test_chord_analyzer_all_n_chords_returns_empty() -> None:
    """Test that all N (no chord) results return empty chords."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 1, sr, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    mock_chords = [
        {"start_time": 0.0, "end_time": 1.0, "chord": "N", "confidence": "low"},
    ]
    with patch.object(analyzer._recognizer, "recognize", return_value=mock_chords):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )
    summary = result["sections"][0]
    assert summary["chords"] == []


def test_chord_analyzer_deduplicates_user_chords() -> None:
    """Test analyzer deduplicates identical user-sourced chords within a section."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    roles_by_section = {
        "verse-1": [
            {"harmony": {"chord": "Am", "functionLabel": "vi", "source": "user"}},
            {"harmony": {"chord": "Am", "functionLabel": "vi repeated", "source": "user"}},
        ]
    }
    result = analyzer.analyze(sections, roles_by_section)
    assert len(result["sections"][0]["chords"]) == 1
    assert result["sections"][0]["chords"][0]["chord"] == "Am"


def test_chord_analyzer_deduplicates_recognized_chords() -> None:
    """Test analyzer deduplicates identical recognized chords within a section."""
    analyzer = ChordAnalyzer()
    sections = [{"id": "verse-1"}]
    sr = 22050
    t = np.linspace(0, 2, sr * 2, endpoint=False)
    other_stem = np.sin(2 * np.pi * 261.63 * t).astype(np.float32)

    recognized = [
        {"start_time": 0.0, "end_time": 1.0, "chord": "C", "confidence": "high"},
        {"start_time": 1.0, "end_time": 2.0, "chord": "C", "confidence": "high"},
    ]

    with patch.object(analyzer._recognizer, "recognize", return_value=recognized):
        result = analyzer.analyze(
            sections,
            audio_stems={"other": other_stem},
            sample_rate=sr,
        )

    assert len(result["sections"][0]["chords"]) == 1
    assert result["sections"][0]["chords"][0]["chord"] == "C"


def test_chord_analyzer_confidence_fallthrough_all_n() -> None:
    """Test analyzer falls through to medium confidence when recognized chords are all N."""
    analyzer = ChordAnalyzer()

    # Setup inputs for _compute_section_confidence directly
    chords = [{"chord": "C", "functionLabel": "", "source": "model"}]
    recognized_chords = [{"start_time": 0.0, "end_time": 1.0, "chord": "N", "confidence": "high"}]
    user_chords = []

    confidence_level, confidence_source = analyzer._compute_section_confidence(
        chords=chords,
        recognized_chords=recognized_chords,
        user_chords=user_chords,
    )

    assert confidence_level == "medium"
    assert confidence_source == "model"
