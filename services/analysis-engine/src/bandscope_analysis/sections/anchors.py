"""Helper functions for creating cue anchors."""

from .model import CueAnchor, CueAnchorStrategy


def count_based_anchor(beat: int = 1, bar: int = 1) -> CueAnchor:
    """Create a count-based anchor, usually used when no lyrics are available."""
    return {
        "strategy": CueAnchorStrategy.COUNT.value,
        "value": f"Enter on beat {beat} of bar {bar}",
    }


def lyric_phrase_anchor(phrase: str) -> CueAnchor:
    """Create a lyric-based anchor using the given phrase."""
    return {"strategy": CueAnchorStrategy.LYRIC.value, "value": phrase}
