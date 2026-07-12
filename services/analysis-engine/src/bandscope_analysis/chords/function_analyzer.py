"""Roman-numeral harmonic-function analysis for chord labels in a key.

Given a key (tonic pitch name plus ``"major"``/``"minor"`` mode) and a chord
label such as ``"G7"`` or ``"Bbm"``, this module derives the roman-numeral
function of the chord in that key (``"V7"``, ``"bvii"``, ...). It replaces the
previously hardcoded ``functionLabel`` strings with a real computation and is
designed to compose with the key-detection module: callers pass ``tonic`` and
``mode`` as plain arguments, so no import of the key detector is needed here.

Spelling conventions (documented behaviour):

* Diatonic scale degrees follow the major scale in major keys and the natural
  minor scale in minor keys.
* Non-diatonic intervals are spelled with a flat (``"b"``) prefix on the next
  diatonic degree above (e.g. interval 10 in major is ``"bVII"``, interval 6
  is ``"bV"`` rather than ``"#IV"``). The single exception is interval 11 in
  minor — the raised leading tone — which is spelled ``"#VII"`` because
  ``"bI"`` has no musical meaning.
* Chord quality selects the case and suffix: major chords are uppercase,
  minor and diminished chords are lowercase; ``"7"`` appends ``7``,
  ``"maj7"`` appends ``maj7``, ``"m7"`` appends ``7`` to a lowercase numeral,
  and ``"dim"`` appends ``°`` to a lowercase numeral.

Security Notes:
    Pure in-memory string and integer computation on the arguments only.
    Performs no file, network, subprocess, or other I/O and imports nothing
    beyond the Python standard library's built-ins. Work is bounded by the
    length of the input strings. All failure modes (empty input, unparseable
    chord labels, unknown tonics or modes) return the empty string ``""``
    instead of raising, so no exceptions escape to callers.
"""

from __future__ import annotations

_LETTER_PITCH: dict[str, int] = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
}

_QUALITY_STYLES: dict[str, tuple[bool, str]] = {
    "": (False, ""),
    "m": (True, ""),
    "7": (False, "7"),
    "maj7": (False, "maj7"),
    "m7": (True, "7"),
    "dim": (True, "°"),
}

_MAJOR_DEGREES: dict[int, tuple[str, str]] = {
    0: ("", "I"),
    1: ("b", "II"),
    2: ("", "II"),
    3: ("b", "III"),
    4: ("", "III"),
    5: ("", "IV"),
    6: ("b", "V"),
    7: ("", "V"),
    8: ("b", "VI"),
    9: ("", "VI"),
    10: ("b", "VII"),
    11: ("", "VII"),
}

_MINOR_DEGREES: dict[int, tuple[str, str]] = {
    0: ("", "I"),
    1: ("b", "II"),
    2: ("", "II"),
    3: ("", "III"),
    4: ("b", "IV"),
    5: ("", "IV"),
    6: ("b", "V"),
    7: ("", "V"),
    8: ("", "VI"),
    9: ("b", "VII"),
    10: ("", "VII"),
    11: ("#", "VII"),
}

_MODE_DEGREES: dict[str, dict[int, tuple[str, str]]] = {
    "major": _MAJOR_DEGREES,
    "minor": _MINOR_DEGREES,
}


def _note_pitch_class(note: str) -> int | None:
    """Return the pitch class (0-11) of a note name, or ``None`` if invalid.

    Accepts an uppercase letter ``A``-``G`` optionally followed by a single
    ``#`` or ``b`` accidental (e.g. ``"C"``, ``"F#"``, ``"Bb"``). Enharmonic
    spellings map to the same pitch class (``"Db"`` == ``"C#"`` == 1).
    """
    text = note.strip()
    if len(text) not in (1, 2):
        return None
    base = _LETTER_PITCH.get(text[0])
    if base is None:
        return None
    if len(text) == 1:
        return base
    if text[1] == "#":
        return (base + 1) % 12
    if text[1] == "b":
        return (base - 1) % 12
    return None


def _split_chord(chord: str) -> tuple[int, str] | None:
    """Split a chord label into (root pitch class, quality suffix).

    The root is a note name as accepted by :func:`_note_pitch_class`; the
    remainder must be one of the supported quality suffixes (``""``, ``"m"``,
    ``"7"``, ``"maj7"``, ``"m7"``, ``"dim"``). Returns ``None`` when the label
    is empty, the root is not a valid note, or the quality is unsupported.
    """
    text = chord.strip()
    if not text:
        return None
    root_len = 2 if len(text) >= 2 and text[1] in "#b" else 1
    root_pc = _note_pitch_class(text[:root_len])
    if root_pc is None:
        return None
    quality = text[root_len:]
    if quality not in _QUALITY_STYLES:
        return None
    return root_pc, quality


def analyze_function(chord: str, tonic: str, mode: str) -> str:
    """Return the roman-numeral function of ``chord`` in the given key.

    Args:
        chord: Chord label such as ``"C"``, ``"Am"``, ``"G7"``, ``"Cmaj7"``,
            ``"Dm7"``, or ``"Bdim"``. Sharp and flat roots are supported.
        tonic: Tonic note name of the key, e.g. ``"C"`` or ``"Bb"``.
        mode: Key mode, ``"major"`` or ``"minor"`` (case-insensitive).

    Returns:
        The roman numeral (e.g. ``"I"``, ``"vi"``, ``"V7"``, ``"bVII"``,
        ``"vii°"``), or ``""`` when the chord, tonic, or mode cannot be
        interpreted. This function never raises for string inputs.
    """
    parsed = _split_chord(chord)
    if parsed is None:
        return ""
    tonic_pc = _note_pitch_class(tonic)
    if tonic_pc is None:
        return ""
    degrees = _MODE_DEGREES.get(mode.strip().lower())
    if degrees is None:
        return ""
    root_pc, quality = parsed
    accidental, numeral = degrees[(root_pc - tonic_pc) % 12]
    lowercase, suffix = _QUALITY_STYLES[quality]
    if lowercase:
        numeral = numeral.lower()
    return f"{accidental}{numeral}{suffix}"


def analyze_progression(chords: list[str], tonic: str, mode: str) -> list[str]:
    """Return roman numerals for each chord in ``chords``, in order.

    The result is a parallel list of the same length as ``chords``:
    unparseable entries map to ``""`` rather than being skipped, so indices
    line up with the input progression.

    Args:
        chords: Chord labels to analyze.
        tonic: Tonic note name of the key, e.g. ``"C"`` or ``"Bb"``.
        mode: Key mode, ``"major"`` or ``"minor"`` (case-insensitive).

    Returns:
        A list of roman-numeral strings, with ``""`` for entries that could
        not be interpreted.
    """
    return [analyze_function(chord, tonic, mode) for chord in chords]
