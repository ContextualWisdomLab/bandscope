"""Structural segmentation package for BandScope.

Detects song section boundaries (Intro, Verse, Chorus, Bridge, Outro)
from raw audio using self-similarity matrices (SSM) and onset novelty curves.
"""

from .model import SegmentationResult, SegmentBoundary
from .segmenter import AudioSegmenter

__all__ = [
    "AudioSegmenter",
    "SegmentBoundary",
    "SegmentationResult",
]
