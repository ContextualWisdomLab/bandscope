"""Tests for section anchor generation functions."""

from bandscope_analysis.sections.anchors import count_based_anchor, lyric_phrase_anchor
from bandscope_analysis.sections.model import CueAnchorStrategy


def test_count_based_anchor_default() -> None:
    """Test count_based_anchor with default parameters."""
    result = count_based_anchor()
    assert result["strategy"] == CueAnchorStrategy.COUNT.value
    assert result["value"] == "Enter on beat 1 of bar 1"


def test_count_based_anchor_custom() -> None:
    """Test count_based_anchor with custom parameters."""
    result = count_based_anchor(beat=4, bar=2)
    assert result["strategy"] == CueAnchorStrategy.COUNT.value
    assert result["value"] == "Enter on beat 4 of bar 2"


def test_lyric_phrase_anchor_normal() -> None:
    """Test lyric_phrase_anchor with a normal phrase."""
    phrase = "hello world"
    result = lyric_phrase_anchor(phrase)
    assert result["strategy"] == CueAnchorStrategy.LYRIC.value
    assert result["value"] == phrase


def test_lyric_phrase_anchor_empty() -> None:
    """Test lyric_phrase_anchor with an empty string."""
    phrase = ""
    result = lyric_phrase_anchor(phrase)
    assert result["strategy"] == CueAnchorStrategy.LYRIC.value
    assert result["value"] == phrase
