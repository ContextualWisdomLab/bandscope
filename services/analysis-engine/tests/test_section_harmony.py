"""Tests for per-section harmony summaries (section_harmony module)."""

from typing import Any

import pytest

from bandscope_analysis.chords.section_harmony import (
    SectionHarmony,
    summarize_section_harmony,
)


def _segment(start: float, end: float, chord: str) -> dict[str, object]:
    """Build a chord segment dict shaped like the recognizer's TrackedChord."""
    return {"start_time": start, "end_time": end, "chord": chord, "confidence": "high"}


def test_segment_straddling_boundary_splits_exactly() -> None:
    """A segment spanning a boundary contributes only its in-section portion."""
    segments = [_segment(0.0, 2.0, "C"), _segment(2.0, 5.0, "G")]
    boundaries = [(0.0, 3.0), (3.0, 5.0)]

    result = summarize_section_harmony(segments, boundaries)

    assert len(result) == 2

    first, second = result
    assert first["start_time"] == 0.0
    assert first["end_time"] == 3.0
    assert first["main_chord"] == "C"
    assert first["chords"] == [
        {"chord": "C", "duration": pytest.approx(2.0)},
        {"chord": "G", "duration": pytest.approx(1.0)},
    ]
    assert first["chord_changes"] == 1

    assert second["main_chord"] == "G"
    assert second["chords"] == [{"chord": "G", "duration": pytest.approx(2.0)}]
    assert second["chord_changes"] == 0


def test_main_chord_picked_by_duration_not_count() -> None:
    """Three short C segments must lose to one long G segment."""
    segments = [
        _segment(0.0, 0.5, "C"),
        _segment(1.0, 1.5, "C"),
        _segment(2.0, 2.5, "C"),
        _segment(3.0, 6.0, "G"),
    ]

    result = summarize_section_harmony(segments, [(0.0, 6.0)])

    assert len(result) == 1
    section = result[0]
    assert section["main_chord"] == "G"
    assert section["chords"] == [
        {"chord": "G", "duration": pytest.approx(3.0)},
        {"chord": "C", "duration": pytest.approx(1.5)},
    ]
    # C -> C -> C -> G: consecutive identical chords are not changes.
    assert section["chord_changes"] == 1


def test_no_chord_label_excluded_from_main_but_listed() -> None:
    """ "N" never wins main_chord but still appears in the duration list."""
    segments = [_segment(0.0, 10.0, "N"), _segment(10.0, 11.0, "Am")]

    result = summarize_section_harmony(segments, [(0.0, 11.0)])

    section = result[0]
    assert section["main_chord"] == "Am"
    assert section["chords"][0] == {"chord": "N", "duration": pytest.approx(10.0)}
    assert section["chords"][1] == {"chord": "Am", "duration": pytest.approx(1.0)}


def test_all_no_chord_section_has_empty_main_chord() -> None:
    """A section containing only "N" yields main_chord == ""."""
    segments = [_segment(0.0, 4.0, "N")]

    result = summarize_section_harmony(segments, [(0.0, 4.0)])

    assert result[0]["main_chord"] == ""
    assert result[0]["chords"] == [{"chord": "N", "duration": pytest.approx(4.0)}]


def test_empty_boundaries_returns_empty_list() -> None:
    """No boundaries means no sections at all."""
    assert summarize_section_harmony([_segment(0.0, 1.0, "C")], []) == []


def test_empty_segments_returns_per_section_empty_summaries() -> None:
    """No chord segments means empty summaries for each section."""
    result = summarize_section_harmony([], [(0.0, 4.0), (4.0, 8.0)])

    expected: list[SectionHarmony] = [
        {
            "start_time": 0.0,
            "end_time": 4.0,
            "main_chord": "",
            "chords": [],
            "chord_changes": 0,
        },
        {
            "start_time": 4.0,
            "end_time": 8.0,
            "main_chord": "",
            "chords": [],
            "chord_changes": 0,
        },
    ]
    assert result == expected


def test_section_with_no_overlapping_chords_is_empty() -> None:
    """A section outside every segment window has no chords and main_chord ""."""
    segments = [_segment(0.0, 2.0, "C")]

    result = summarize_section_harmony(segments, [(10.0, 12.0)])

    assert result[0]["main_chord"] == ""
    assert result[0]["chords"] == []
    assert result[0]["chord_changes"] == 0


def test_malformed_segments_are_skipped() -> None:
    """Segments with bad keys, types, or non-positive spans do not contribute."""
    segments: list[dict[str, object]] = [
        {"end_time": 1.0, "chord": "C"},  # missing start_time
        {"start_time": True, "end_time": 1.0, "chord": "C"},  # bool start
        {"start_time": 0.0, "end_time": "x", "chord": "C"},  # non-numeric end
        {"start_time": 0.0, "end_time": 1.0, "chord": 7},  # non-str chord
        {"start_time": 2.0, "end_time": 2.0, "chord": "C"},  # zero span
        _segment(0.0, 3.0, "Em"),  # the only valid one
    ]

    result = summarize_section_harmony(segments, [(0.0, 3.0)])

    assert result[0]["main_chord"] == "Em"
    assert result[0]["chords"] == [{"chord": "Em", "duration": pytest.approx(3.0)}]
    assert result[0]["chord_changes"] == 0


@pytest.mark.parametrize(
    ("start", "end"),
    [
        (float("nan"), 1.0),
        (0.0, float("nan")),
        (float("-inf"), 1.0),
        (0.0, float("inf")),
    ],
)
def test_non_finite_segments_are_skipped(start: float, end: float) -> None:
    """Non-finite timing cannot poison an otherwise valid harmony summary."""
    segments = [_segment(start, end, "G"), _segment(0.0, 2.0, "C")]

    result = summarize_section_harmony(segments, [(0.0, 2.0)])

    assert result[0]["main_chord"] == "C"
    assert result[0]["chords"] == [{"chord": "C", "duration": pytest.approx(2.0)}]
    assert result[0]["chord_changes"] == 0


def test_malformed_boundary_is_skipped() -> None:
    """A boundary that cannot be coerced to floats is dropped, others survive."""
    boundaries: Any = [("x", "y"), (0.0, 2.0)]

    result = summarize_section_harmony([_segment(0.0, 2.0, "D")], boundaries)

    assert len(result) == 1
    assert result[0]["main_chord"] == "D"


@pytest.mark.parametrize(
    "invalid_boundary",
    [
        (float("nan"), 2.0),
        (0.0, float("nan")),
        (float("-inf"), 2.0),
        (0.0, float("inf")),
        (2.0, 2.0),
        (3.0, 2.0),
    ],
)
def test_invalid_numeric_boundary_is_skipped(
    invalid_boundary: tuple[float, float],
) -> None:
    """Only finite positive-span section windows can enter result summaries."""
    boundaries = [invalid_boundary, (0.0, 2.0)]

    result = summarize_section_harmony([_segment(0.0, 2.0, "D")], boundaries)

    assert len(result) == 1
    assert result[0]["start_time"] == 0.0
    assert result[0]["end_time"] == 2.0
    assert result[0]["main_chord"] == "D"


def test_non_iterable_segments_fail_safe() -> None:
    """A non-iterable chord_segments input returns [] instead of raising."""
    bad_segments: Any = 42

    assert summarize_section_harmony(bad_segments, [(0.0, 1.0)]) == []


def test_ties_break_alphabetically_for_determinism() -> None:
    """Equal-duration chords are ordered by chord name for stable output."""
    segments = [_segment(0.0, 1.0, "G"), _segment(1.0, 2.0, "C")]

    result = summarize_section_harmony(segments, [(0.0, 2.0)])

    assert result[0]["chords"] == [
        {"chord": "C", "duration": pytest.approx(1.0)},
        {"chord": "G", "duration": pytest.approx(1.0)},
    ]
    assert result[0]["main_chord"] == "C"
    assert result[0]["chord_changes"] == 1
