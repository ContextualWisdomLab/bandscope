"""Data models for temporal analysis."""

from __future__ import annotations

from typing import TypedDict


class TemporalFeatures(TypedDict):
    """Features extracted during temporal analysis."""

    bpm: float
    beat_times: list[float]
    downbeat_times: list[float]
    duration_seconds: float
    sample_rate: int
    audio_path: str
