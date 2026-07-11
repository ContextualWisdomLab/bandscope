"""Chord analysis module for extracting harmonic content from sections."""

from .analyzer import ChordAnalyzer
from .capo import detect_capo_and_tuning
from .chord_recognizer import ChordRecognizer, TrackedChord
from .function_analyzer import analyze_function, analyze_progression
from .model import ChordAnalysisResult, ChordLabel, SectionChordSummary
from .section_harmony import ChordDuration, SectionHarmony, summarize_section_harmony
from .transposition import (
    CapoPlayerKeyResult,
    PlayerKeyResult,
    capo_player_key,
    player_key,
    transpose_chord,
)

__all__ = [
    "CapoPlayerKeyResult",
    "ChordAnalyzer",
    "ChordAnalysisResult",
    "ChordDuration",
    "ChordLabel",
    "ChordRecognizer",
    "PlayerKeyResult",
    "SectionChordSummary",
    "SectionHarmony",
    "TrackedChord",
    "analyze_function",
    "analyze_progression",
    "detect_capo_and_tuning",
    "capo_player_key",
    "player_key",
    "summarize_section_harmony",
    "transpose_chord",
]
