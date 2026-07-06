"""Chord analysis module for extracting harmonic content from sections."""

from .analyzer import ChordAnalyzer
from .capo import detect_capo_and_tuning
from .chord_recognizer import ChordRecognizer, TrackedChord
from .model import ChordAnalysisResult, ChordLabel, SectionChordSummary
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
    "ChordLabel",
    "ChordRecognizer",
    "PlayerKeyResult",
    "SectionChordSummary",
    "TrackedChord",
    "detect_capo_and_tuning",
    "capo_player_key",
    "player_key",
    "transpose_chord",
]
