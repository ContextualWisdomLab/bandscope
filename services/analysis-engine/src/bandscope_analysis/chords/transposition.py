"""Concert-key versus player-key transposition for transposing instruments.

The rehearsal domain model needs to show every band member the key *they*
read, not just the concert key detected from audio. A Bb trumpet reading a
chart in "D major" sounds in "C major"; a guitarist with a capo on fret 1
fingers "A major" shapes to sound "Bb major".

Instrument offsets are expressed as the written-pitch offset in semitones UP
from concert pitch:

* C instruments (piano, guitar, bass, voice, flute, violin): ``0``. Guitar
  and bass actually *sound* an octave below written pitch, but an octave
  displacement never changes the key name, so they are treated as ``0`` for
  key purposes.
* Bb instruments (trumpet, clarinet, soprano sax): ``+2``. Tenor sax is
  written a major ninth (+14 semitones) above concert; key names repeat
  every octave, so this normalizes to ``+2``.
* Eb instruments (alto sax, bari sax): ``+9``.
* F instruments (french horn, english horn): ``+7``.

Enharmonic spellings are chosen by key-signature simplicity: the candidate
tonic whose key signature has fewer accidentals wins (e.g. transposing B
major up 2 semitones prefers Db major with 5 flats over C# major with 7
sharps); ties prefer the sharp spelling (e.g. F# major over Gb major).

Security Notes:
    Pure string/int computation over fixed lookup tables. No I/O, no eval,
    no external dependencies, and all loops are bounded by constant-size
    tables. Malformed input never raises: unknown instruments echo back
    with a transposition of 0, and unparseable tonics or chords produce
    empty-string fields instead of exceptions.
"""

from __future__ import annotations

from typing import Final, TypedDict


class PlayerKeyResult(TypedDict):
    """Concert-to-player key mapping for a transposing instrument."""

    concertKey: str
    playerKey: str
    transposition: int
    instrument: str


class CapoPlayerKeyResult(TypedDict):
    """Concert-to-player key mapping for a capoed guitar."""

    concertKey: str
    playerKey: str
    capo: int


#: Written-pitch offset in semitones UP from concert pitch, per instrument.
INSTRUMENT_TRANSPOSITIONS: Final[dict[str, int]] = {
    # C instruments (concert pitch).
    "piano": 0,
    "guitar": 0,  # Sounds an octave lower: octave-only, so 0 for key purposes.
    "bass": 0,  # Sounds an octave lower: octave-only, so 0 for key purposes.
    "voice": 0,
    "flute": 0,
    "violin": 0,
    # Bb instruments.
    "trumpet": 2,
    "clarinet": 2,
    "tenor sax": 2,  # Written +14 (major ninth); normalized mod 12 to +2.
    "soprano sax": 2,
    # Eb instruments.
    "alto sax": 9,
    "bari sax": 9,
    # F instruments.
    "french horn": 7,
    "english horn": 7,
}

#: Semitone pitch class for each recognized tonic spelling.
_PITCH_CLASSES: Final[dict[str, int]] = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
    "Cb": 11,
}

#: Candidate tonic spellings for each pitch class, sharp spelling first.
_SPELLING_CANDIDATES: Final[dict[int, tuple[str, ...]]] = {
    0: ("C",),
    1: ("C#", "Db"),
    2: ("D",),
    3: ("D#", "Eb"),
    4: ("E",),
    5: ("F",),
    6: ("F#", "Gb"),
    7: ("G",),
    8: ("G#", "Ab"),
    9: ("A",),
    10: ("A#", "Bb"),
    11: ("B", "Cb"),
}

#: Number of accidentals in the key signature of each standard major key.
_MAJOR_KEY_ACCIDENTALS: Final[dict[str, int]] = {
    "C": 0,
    "G": 1,
    "D": 2,
    "A": 3,
    "E": 4,
    "B": 5,
    "F#": 6,
    "C#": 7,
    "F": 1,
    "Bb": 2,
    "Eb": 3,
    "Ab": 4,
    "Db": 5,
    "Gb": 6,
    "Cb": 7,
}

#: Number of accidentals in the key signature of each standard minor key.
_MINOR_KEY_ACCIDENTALS: Final[dict[str, int]] = {
    "A": 0,
    "E": 1,
    "B": 2,
    "F#": 3,
    "C#": 4,
    "G#": 5,
    "D#": 6,
    "A#": 7,
    "D": 1,
    "G": 2,
    "C": 3,
    "F": 4,
    "Bb": 5,
    "Eb": 6,
    "Ab": 7,
}

#: Sentinel accidental count for spellings outside the standard circle of
#: fifths (e.g. a "D# major" signature), guaranteeing the other candidate wins.
_NON_STANDARD_KEY: Final[int] = 99


def _parse_tonic(tonic: str) -> int | None:
    """Parse a tonic name such as ``"C"``, ``"F#"``, or ``"Bb"``.

    Args:
        tonic: Tonic spelling. A letter A-G optionally followed by a single
            ``#`` or ``b``. Leading/trailing whitespace is ignored and the
            letter is case-insensitive.

    Returns:
        The pitch class 0-11, or ``None`` when the string is unparseable.
    """
    cleaned = tonic.strip()
    if not 1 <= len(cleaned) <= 2:
        return None
    normalized = cleaned[0].upper() + cleaned[1:]
    return _PITCH_CLASSES.get(normalized)


def _accidental_count(tonic: str, mode: str) -> int:
    """Count key-signature accidentals for a candidate tonic spelling.

    Args:
        tonic: Candidate tonic spelling (e.g. ``"Db"``).
        mode: Either ``"major"`` or ``"minor"``.

    Returns:
        The number of sharps or flats in that key's signature, or a large
        sentinel for spellings outside the standard circle of fifths.
    """
    table = _MAJOR_KEY_ACCIDENTALS if mode == "major" else _MINOR_KEY_ACCIDENTALS
    return table.get(tonic, _NON_STANDARD_KEY)


def _preferred_spelling(pitch_class: int, mode: str) -> str:
    """Choose the preferred enharmonic tonic spelling for a pitch class.

    The spelling whose key signature has fewer accidentals wins; ties
    prefer the sharp spelling (candidates are listed sharp-first, and
    ``min`` keeps the earliest entry on ties).

    Args:
        pitch_class: Pitch class 0-11.
        mode: Either ``"major"`` or ``"minor"``.

    Returns:
        The preferred tonic spelling, e.g. ``"Db"`` for pitch class 1 in
        major (5 flats beats C# major's 7 sharps).
    """
    candidates = _SPELLING_CANDIDATES[pitch_class % 12]
    return min(candidates, key=lambda name: _accidental_count(name, mode))


def _normalize_mode(mode: str) -> str | None:
    """Normalize a mode string to ``"major"`` or ``"minor"``.

    Args:
        mode: Mode name, case-insensitive, surrounding whitespace ignored.

    Returns:
        ``"major"`` or ``"minor"``, or ``None`` for anything else.
    """
    cleaned = mode.strip().lower()
    if cleaned in ("major", "minor"):
        return cleaned
    return None


def _transposed_key_name(concert_tonic: str, mode: str, semitones: int) -> tuple[str, str]:
    """Compute concert and transposed key names.

    Args:
        concert_tonic: Concert-key tonic spelling (e.g. ``"Bb"``).
        mode: Mode name (``"major"`` or ``"minor"``, case-insensitive).
        semitones: Signed transposition in semitones; reduced mod 12.

    Returns:
        A ``(concert_key, player_key)`` pair such as
        ``("Bb major", "C major")``, or ``("", "")`` when the tonic or mode
        cannot be parsed.
    """
    normalized_mode = _normalize_mode(mode)
    pitch_class = _parse_tonic(concert_tonic)
    if normalized_mode is None or pitch_class is None:
        return "", ""
    cleaned_tonic = concert_tonic.strip()
    concert_name = cleaned_tonic[0].upper() + cleaned_tonic[1:]
    player_tonic = _preferred_spelling((pitch_class + semitones) % 12, normalized_mode)
    return f"{concert_name} {normalized_mode}", f"{player_tonic} {normalized_mode}"


def player_key(concert_tonic: str, mode: str, instrument: str) -> PlayerKeyResult:
    """Map a concert key to the written key a player of ``instrument`` reads.

    Args:
        concert_tonic: Concert-key tonic spelling (e.g. ``"C"``, ``"Bb"``).
        mode: ``"major"`` or ``"minor"`` (case-insensitive).
        instrument: Instrument name (case-insensitive). Unknown instruments
            are treated as concert pitch (transposition ``0``) and echoed
            back unchanged.

    Returns:
        A mapping with ``concertKey``, ``playerKey``, ``transposition``
        (semitones up from concert), and ``instrument``. Unparseable tonic
        or mode yields empty-string key fields; no exceptions are raised.
    """
    transposition = INSTRUMENT_TRANSPOSITIONS.get(instrument.strip().lower(), 0)
    concert_key, written_key = _transposed_key_name(concert_tonic, mode, transposition)
    return {
        "concertKey": concert_key,
        "playerKey": written_key,
        "transposition": transposition,
        "instrument": instrument,
    }


def capo_player_key(concert_tonic: str, mode: str, capo: int) -> CapoPlayerKeyResult:
    """Map a concert key to the shape key a guitarist fingers with a capo.

    A capo on fret ``n`` raises every fingered shape by ``n`` semitones, so
    the player fingers shapes ``n`` semitones BELOW concert (e.g. capo 1
    with concert Bb major is played using A-major shapes).

    Args:
        concert_tonic: Concert-key tonic spelling (e.g. ``"Bb"``).
        mode: ``"major"`` or ``"minor"`` (case-insensitive).
        capo: Capo fret number; reduced mod 12, so values outside 0-11
            stay bounded.

    Returns:
        A mapping with ``concertKey``, ``playerKey``, and ``capo``.
        Unparseable tonic or mode yields empty-string key fields; no
        exceptions are raised.
    """
    concert_key, shape_key = _transposed_key_name(concert_tonic, mode, -(capo % 12))
    return {
        "concertKey": concert_key,
        "playerKey": shape_key,
        "capo": capo,
    }


def transpose_chord(chord: str, semitones: int) -> str:
    """Transpose a chord label, preserving its quality suffix.

    The new root uses the preferred-spelling rule evaluated as a major-key
    root (fewer key-signature accidentals; ties prefer sharps), so
    ``"Am7"`` up 2 becomes ``"Bm7"`` and ``"F#"`` up 1 becomes ``"G"``.
    Negative offsets are supported; all offsets are reduced mod 12.

    Args:
        chord: Chord label such as ``"Am7"``, ``"F#"``, or ``"Bbmaj7"``:
            a root letter A-G, an optional single ``#`` or ``b``, then any
            quality suffix, which is preserved verbatim.
        semitones: Signed transposition in semitones.

    Returns:
        The transposed chord label, or ``""`` when the root cannot be
        parsed. No exceptions are raised.
    """
    cleaned = chord.strip()
    if not cleaned:
        return ""
    root = cleaned[0].upper()
    if root not in "ABCDEFG":
        return ""
    accidental = ""
    if len(cleaned) > 1 and cleaned[1] in "#b":
        accidental = cleaned[1]
    pitch_class = _PITCH_CLASSES.get(root + accidental)
    if pitch_class is None:
        return ""
    suffix = cleaned[1 + len(accidental) :]
    new_root = _preferred_spelling((pitch_class + semitones) % 12, "major")
    return f"{new_root}{suffix}"
