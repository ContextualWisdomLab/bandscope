"""Temporal analysis module (audio decoding, tempo, beat tracking)."""

from .accelerando import accelerando_plan_copy, apply_accelerando_plan, first_accelerando
from .analyzer import TemporalAnalyzer
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
    "apply_accelerando_plan",
    "detect_groove",
    "first_accelerando",
    "accelerando_plan_copy",
]
