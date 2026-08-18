"""Regressions for fail-closed section-harmony iterable failures."""

from collections.abc import Iterator, Mapping

from bandscope_analysis.chords.section_harmony import summarize_section_harmony


def _exploding_segments() -> Iterator[Mapping[str, object]]:
    """Raise after iteration begins to model a corrupted lazy segment source."""
    yield from ()
    raise RuntimeError("segment source failed during iteration")


def test_segment_iterator_failure_returns_empty_summary_instead_of_raising() -> None:
    """Unexpected iterable failures remain contained at the public summarizer boundary."""
    assert summarize_section_harmony(_exploding_segments(), [(0.0, 1.0)]) == []
