"""Temporal analysis module (audio decoding, tempo, beat tracking)."""

from .analyzer import TemporalAnalyzer
from .fermata import apply_fermata_plan, fermata_plan_copy, first_fermata
from .groove import GrooveResult, detect_groove
from .model import TemporalFeatures
from .stability import TempoChange, TempoStability, analyze_tempo_stability

__all__ = [
    "GrooveResult",
    "TempoChange",
    "TempoStability",
    "TemporalAnalyzer",
    "TemporalFeatures",
    "analyze_tempo_stability",
    "apply_fermata_plan",
    "detect_groove",
    "fermata_plan_copy",
    "first_fermata",
]
