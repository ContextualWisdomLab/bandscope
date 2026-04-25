"""
Transcription module for BandScope analysis engine.
"""

from .api import NoteEvent, transcribe_bass_stem

__all__ = [
    "transcribe_bass_stem",
    "NoteEvent",
]
