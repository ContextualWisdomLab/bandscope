"""Identity-safety regressions for rehearsal register-overlap warnings.

The four-stem separator's ``other`` stem is mixed accompaniment evidence. It
cannot identify which keyboard or guitar role caused the overlap, so warnings
may guide the unambiguous stem-side role without assigning the same evidence to
specific accompaniment roles.
"""

from bandscope_analysis.roles.overlap import format_overlap_warnings


def test_mixed_accompaniment_overlap_warns_only_unambiguous_bass_role() -> None:
    """Do not project mixed ``other`` evidence onto named accompaniment roles."""
    warnings = format_overlap_warnings(
        [
            {
                "stem_a": "bass",
                "stem_b": "other",
                "band": "low",
                "severity": 0.91,
            }
        ]
    )

    expected = (
        "The low register is crowded between Bass Guitar and accompaniment. "
        "Thin one part in this section so players can hear their cue."
    )
    assert warnings == {"bass-guitar": [expected]}


def test_mixed_accompaniment_overlap_warns_only_unambiguous_vocal_role() -> None:
    """Lead-vocal evidence stays actionable without inventing a keyboard identity."""
    warnings = format_overlap_warnings(
        [
            {
                "stem_a": "other",
                "stem_b": "vocals",
                "band": "mid",
                "severity": 0.77,
            }
        ]
    )

    expected = (
        "The mid register is crowded between accompaniment and Lead Vocal. "
        "Thin one part in this section so players can hear their cue."
    )
    assert warnings == {"lead-vocal": [expected]}
