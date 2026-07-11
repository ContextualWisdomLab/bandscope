"""Tests for roman-numeral harmonic-function analysis."""

from __future__ import annotations

import pytest

from bandscope_analysis.chords.function_analyzer import (
    analyze_function,
    analyze_progression,
)


class TestMajorKeyDiatonic:
    """Diatonic functions in a major key match textbook harmony."""

    @pytest.mark.parametrize(
        ("chord", "expected"),
        [
            ("C", "I"),
            ("Dm", "ii"),
            ("Em", "iii"),
            ("F", "IV"),
            ("G", "V"),
            ("Am", "vi"),
            ("Bdim", "vii°"),
        ],
    )
    def test_c_major_triads(self, chord: str, expected: str) -> None:
        """All seven diatonic triads of C major get the expected numeral."""
        assert analyze_function(chord, "C", "major") == expected

    @pytest.mark.parametrize(
        ("chord", "expected"),
        [
            ("G7", "V7"),
            ("Cmaj7", "Imaj7"),
            ("Dm7", "ii7"),
            ("Am7", "vi7"),
        ],
    )
    def test_c_major_sevenths(self, chord: str, expected: str) -> None:
        """Seventh-chord qualities append the right suffix in C major."""
        assert analyze_function(chord, "C", "major") == expected

    def test_flat_key_diatonic(self) -> None:
        """In F major, Bb is the diatonic IV chord."""
        assert analyze_function("Bb", "F", "major") == "IV"


class TestMinorKeyDegrees:
    """Functions in a (natural) minor key, including the major V."""

    @pytest.mark.parametrize(
        ("chord", "expected"),
        [
            ("Am", "i"),
            ("C", "III"),
            ("Dm", "iv"),
            ("E", "V"),
            ("G", "VII"),
            ("F", "VI"),
            ("Bdim", "ii°"),
            ("E7", "V7"),
        ],
    )
    def test_a_minor(self, chord: str, expected: str) -> None:
        """Chords in A minor map to natural-minor degrees; major V stays V."""
        assert analyze_function(chord, "A", "minor") == expected

    def test_raised_leading_tone_uses_sharp_seven(self) -> None:
        """G#dim in A minor is the raised leading tone, spelled #vii°."""
        assert analyze_function("G#dim", "A", "minor") == "#vii°"

    def test_minor_mode_flat_spellings(self) -> None:
        """Non-diatonic minor-key intervals use the documented flat spelling."""
        assert analyze_function("C#", "A", "minor") == "bIV"
        assert analyze_function("Bb", "A", "minor") == "bII"
        assert analyze_function("Eb", "A", "minor") == "bV"
        assert analyze_function("F#", "A", "minor") == "bVII"


class TestChromaticSpelling:
    """Non-diatonic roots in major keys use consistent flat spellings."""

    @pytest.mark.parametrize(
        ("chord", "expected"),
        [
            ("Bb", "bVII"),
            ("Db", "bII"),
            ("Eb", "bIII"),
            ("Gb", "bV"),
            ("Ab", "bVI"),
            ("Bbm", "bvii"),
        ],
    )
    def test_c_major_chromatic_roots(self, chord: str, expected: str) -> None:
        """Borrowed/chromatic roots in C major get a flat prefix."""
        assert analyze_function(chord, "C", "major") == expected

    def test_enharmonic_roots_are_equivalent(self) -> None:
        """Db and C# share a pitch class, so they get the same numeral."""
        assert analyze_function("Db", "C", "major") == analyze_function("C#", "C", "major")
        assert analyze_function("C#", "C", "major") == "bII"

    def test_sharp_and_flat_tonics(self) -> None:
        """Tonic names with accidentals parse, including enharmonic pairs."""
        assert analyze_function("F#", "F#", "major") == "I"
        assert analyze_function("Gb", "F#", "major") == "I"
        assert analyze_function("Ab", "Eb", "major") == "IV"


class TestSafeFailure:
    """Bad input returns the empty string instead of raising."""

    @pytest.mark.parametrize(
        "chord",
        ["", "   ", "X#", "H", "Csus4", "Cbb", "C#x", "cm"],
    )
    def test_unparseable_chord(self, chord: str) -> None:
        """Empty or malformed chord labels return an empty numeral."""
        assert analyze_function(chord, "C", "major") == ""

    @pytest.mark.parametrize("tonic", ["", "H", "Cx", "C##"])
    def test_unknown_tonic(self, tonic: str) -> None:
        """Unknown tonic names return an empty numeral."""
        assert analyze_function("C", tonic, "major") == ""

    @pytest.mark.parametrize("mode", ["", "dorian", "MAJ"])
    def test_unknown_mode(self, mode: str) -> None:
        """Modes other than major/minor return an empty numeral."""
        assert analyze_function("C", "C", mode) == ""

    def test_mode_is_case_insensitive(self) -> None:
        """Mode comparison ignores case and surrounding whitespace."""
        assert analyze_function("G", "C", " Major ") == "V"
        assert analyze_function("Am", "A", "MINOR") == "i"


class TestAnalyzeProgression:
    """Progression analysis returns a parallel list."""

    def test_maps_each_chord(self) -> None:
        """A classic progression in C major maps chord-for-chord."""
        chords = ["C", "Am", "F", "G7"]
        assert analyze_progression(chords, "C", "major") == ["I", "vi", "IV", "V7"]

    def test_keeps_unparseable_entries_as_empty_strings(self) -> None:
        """Unparseable entries stay in place as "" so indices line up."""
        chords = ["C", "???", "G"]
        assert analyze_progression(chords, "C", "major") == ["I", "", "V"]

    def test_empty_progression(self) -> None:
        """An empty progression yields an empty list."""
        assert analyze_progression([], "C", "major") == []
