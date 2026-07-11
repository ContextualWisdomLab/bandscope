"""Tests for concert-key versus player-key transposition."""

from bandscope_analysis.chords.transposition import (
    INSTRUMENT_TRANSPOSITIONS,
    capo_player_key,
    player_key,
    transpose_chord,
)


class TestPlayerKey:
    """Concert-to-written key mapping per instrument."""

    def test_c_major_trumpet_reads_d_major(self) -> None:
        """A Bb trumpet reads two semitones above concert."""
        assert player_key("C", "major", "trumpet") == {
            "concertKey": "C major",
            "playerKey": "D major",
            "transposition": 2,
            "instrument": "trumpet",
        }

    def test_c_major_alto_sax_reads_a_major(self) -> None:
        """An Eb alto sax reads nine semitones above concert."""
        result = player_key("C", "major", "alto sax")
        assert result["playerKey"] == "A major"
        assert result["transposition"] == 9

    def test_c_major_french_horn_reads_g_major(self) -> None:
        """An F horn reads seven semitones above concert."""
        result = player_key("C", "major", "french horn")
        assert result["playerKey"] == "G major"
        assert result["transposition"] == 7

    def test_c_instrument_is_identity(self) -> None:
        """Concert-pitch instruments read the concert key unchanged."""
        for instrument in ("piano", "guitar", "bass", "voice", "flute", "violin"):
            result = player_key("Eb", "major", instrument)
            assert result["concertKey"] == "Eb major"
            assert result["playerKey"] == "Eb major"
            assert result["transposition"] == 0

    def test_bb_major_trumpet_reads_c_major(self) -> None:
        """Concert Bb major is written C major for Bb instruments."""
        result = player_key("Bb", "major", "trumpet")
        assert result["concertKey"] == "Bb major"
        assert result["playerKey"] == "C major"

    def test_b_major_trumpet_prefers_db_over_c_sharp(self) -> None:
        """Enharmonic rule: Db major (5 flats) beats C# major (7 sharps)."""
        result = player_key("B", "major", "trumpet")
        assert result["playerKey"] == "Db major"

    def test_e_major_trumpet_prefers_f_sharp_on_tie(self) -> None:
        """Enharmonic tie: F# major (6#) vs Gb major (6b) prefers the sharp."""
        result = player_key("E", "major", "trumpet")
        assert result["playerKey"] == "F# major"

    def test_tenor_sax_normalizes_major_ninth_to_two(self) -> None:
        """Tenor sax's +14 written offset normalizes to +2 for key names."""
        assert INSTRUMENT_TRANSPOSITIONS["tenor sax"] == 2
        assert player_key("C", "major", "tenor sax")["playerKey"] == "D major"

    def test_minor_mode_uses_minor_key_signatures(self) -> None:
        """A minor + alto sax (+9) lands on F# minor (3#), not Gb minor."""
        result = player_key("A", "minor", "alto sax")
        assert result["concertKey"] == "A minor"
        assert result["playerKey"] == "F# minor"

    def test_instrument_lookup_is_case_insensitive(self) -> None:
        """Instrument names match regardless of case and padding."""
        assert player_key("C", "major", "  Trumpet ")["transposition"] == 2

    def test_unknown_instrument_echoes_back_with_zero(self) -> None:
        """Unknown instruments fall back to concert pitch, echoed back."""
        assert player_key("C", "major", "theremin") == {
            "concertKey": "C major",
            "playerKey": "C major",
            "transposition": 0,
            "instrument": "theremin",
        }

    def test_garbage_tonic_is_safe(self) -> None:
        """Unparseable tonics yield empty key fields, no exception."""
        for tonic in ("", "H", "C##", "b#", "  ", "1", "Cbb"):
            result = player_key(tonic, "major", "trumpet")
            assert result["concertKey"] == ""
            assert result["playerKey"] == ""
            assert result["transposition"] == 2

    def test_garbage_mode_is_safe(self) -> None:
        """Unknown modes yield empty key fields, no exception."""
        result = player_key("C", "dorian", "trumpet")
        assert result["concertKey"] == ""
        assert result["playerKey"] == ""


class TestCapoPlayerKey:
    """Capoed-guitar shape keys."""

    def test_capo_1_concert_bb_major_plays_a_shapes(self) -> None:
        """Capo 1 fingers shapes one semitone below concert."""
        assert capo_player_key("Bb", "major", 1) == {
            "concertKey": "Bb major",
            "playerKey": "A major",
            "capo": 1,
        }

    def test_capo_3_concert_eb_major_plays_c_shapes(self) -> None:
        """Capo 3 fingers shapes three semitones below concert."""
        result = capo_player_key("Eb", "major", 3)
        assert result["playerKey"] == "C major"
        assert result["capo"] == 3

    def test_capo_0_is_identity(self) -> None:
        """No capo means shapes match the concert key."""
        assert capo_player_key("G", "major", 0)["playerKey"] == "G major"

    def test_capo_wraps_mod_12(self) -> None:
        """Capo values beyond an octave stay bounded via mod 12."""
        assert capo_player_key("Bb", "major", 13)["playerKey"] == "A major"

    def test_minor_mode(self) -> None:
        """Minor keys transpose with minor-key signature preferences."""
        assert capo_player_key("C", "minor", 2)["playerKey"] == "Bb minor"

    def test_garbage_tonic_is_safe(self) -> None:
        """Unparseable tonics yield empty key fields, no exception."""
        result = capo_player_key("nonsense", "major", 2)
        assert result == {"concertKey": "", "playerKey": "", "capo": 2}


class TestTransposeChord:
    """Chord-label transposition preserving quality suffixes."""

    def test_am7_up_two_is_bm7(self) -> None:
        """The quality suffix is preserved verbatim."""
        assert transpose_chord("Am7", 2) == "Bm7"

    def test_f_sharp_up_one_is_g(self) -> None:
        """Sharp roots parse and land on natural roots."""
        assert transpose_chord("F#", 1) == "G"

    def test_negative_offset_bb_down_two_is_ab(self) -> None:
        """Negative offsets are supported and reduce mod 12."""
        assert transpose_chord("Bb", -2) == "Ab"

    def test_preferred_spelling_uses_major_key_rule(self) -> None:
        """New roots prefer fewer accidentals as a major key root."""
        assert transpose_chord("C", 1) == "Db"  # Db (5b) over C# (7#).
        assert transpose_chord("C", 6) == "F#"  # Tie 6# vs 6b prefers sharp.

    def test_complex_suffix_preserved(self) -> None:
        """Multi-character suffixes survive transposition untouched."""
        assert transpose_chord("Ebmaj7#11", 2) == "Fmaj7#11"

    def test_lowercase_root_is_normalized(self) -> None:
        """Roots are case-insensitive."""
        assert transpose_chord("bb7", 2) == "C7"

    def test_wrap_around_octave(self) -> None:
        """Offsets wrap mod 12 across the octave boundary."""
        assert transpose_chord("B", 2) == "Db"
        assert transpose_chord("A", 14) == "B"

    def test_garbage_chord_is_safe(self) -> None:
        """Unparseable chords return an empty string, no exception."""
        for chord in ("", "   ", "H7", "1m7", "?"):
            assert transpose_chord(chord, 2) == ""

    def test_nonstandard_accidental_root_is_safe(self) -> None:
        """Roots like E# or Fb are outside the table and fail safely."""
        assert transpose_chord("E#7", 1) == ""
        assert transpose_chord("Fb", 1) == ""
