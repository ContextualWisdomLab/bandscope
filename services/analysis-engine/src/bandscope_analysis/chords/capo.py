"""Capo and tuning detection from chord labels using real music theory.

This module derives the most guitar-friendly capo position for a chord
progression by transposing the sounding chords down by each candidate capo
amount and scoring how many of the resulting fingered shapes fall on the
common open ("CAGED") guitar shapes. No song-specific lookups are used; the
result is a deterministic function of the input chord labels.
"""

# Pitch class (0-11) of each natural note name.
_NOTE_TO_PC: dict[str, int] = {
    "C": 0,
    "D": 2,
    "E": 4,
    "F": 5,
    "G": 7,
    "A": 9,
    "B": 11,
}

# Pitch-class names used when rendering fingered shapes (sharps preferred).
_PC_TO_NAME: tuple[str, ...] = (
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
)

# Open major chord shapes available in standard tuning: C, D, E, G, A.
_MAJOR_OPEN_SHAPES: frozenset[int] = frozenset({0, 2, 4, 7, 9})

# Open minor chord shapes available in standard tuning: Dm, Em, Am.
_MINOR_OPEN_SHAPES: frozenset[int] = frozenset({2, 4, 9})

# Highest capo position a guitarist would realistically use.
_MAX_CAPO: int = 7

# Score awarded to a fingered open shape and charged to a barre shape.
_OPEN_SHAPE_REWARD: int = 2
_BARRE_SHAPE_PENALTY: int = 2

# Mild per-fret cost so avoiding a single barre chord never justifies an
# extreme capo jump; a key whose chords all become open still wins easily.
_CAPO_FRET_PENALTY: int = 1


def _parse_chord(label: str) -> tuple[int, bool] | None:
    """Parse a chord label into its root pitch class and minor flag.

    Args:
        label: A chord symbol such as ``"C"``, ``"F#m"``, ``"Bbmaj7"`` or
            ``"D5"``.

    Returns:
        A ``(root_pitch_class, is_minor)`` tuple, or ``None`` if the label
        cannot be parsed as a chord.
    """
    text = label.strip()
    if not text:
        return None

    root_char = text[0].upper()
    if root_char not in _NOTE_TO_PC:
        return None

    pitch_class = _NOTE_TO_PC[root_char]
    index = 1

    # Apply a single leading accidental if present.
    if index < len(text) and text[index] in {"#", "b"}:
        pitch_class += 1 if text[index] == "#" else -1
        index += 1

    quality = text[index:]
    # Minor if the quality starts with "m" but is not a "maj" chord.
    is_minor = quality.startswith("m") and not quality.startswith("maj")

    return pitch_class % 12, is_minor


def _shape_is_open(root_pc: int, is_minor: bool) -> bool:
    """Report whether a fingered shape maps to a common open chord.

    Args:
        root_pc: The pitch class (0-11) of the fingered shape's root.
        is_minor: Whether the shape is a minor chord.

    Returns:
        ``True`` when the shape is a standard open shape, else ``False``.
    """
    if is_minor:
        return root_pc in _MINOR_OPEN_SHAPES
    return root_pc in _MAJOR_OPEN_SHAPES


def _score_capo(shapes: set[tuple[int, bool]], capo: int) -> int:
    """Score how open-chord friendly a capo position is for the shapes.

    Each distinct sounding chord is transposed down by ``capo`` semitones to
    the shape actually fingered. Open shapes are rewarded and anything else
    (implying a barre chord) is penalised, then a mild per-fret cost biases
    the result toward lower capo positions.

    Args:
        shapes: Distinct ``(root_pitch_class, is_minor)`` sounding chords.
        capo: The candidate capo position, in semitones.

    Returns:
        The summed friendliness score for the capo position.
    """
    score = 0
    for root_pc, is_minor in shapes:
        if _shape_is_open((root_pc - capo) % 12, is_minor):
            score += _OPEN_SHAPE_REWARD
        else:
            score -= _BARRE_SHAPE_PENALTY
    return score - capo * _CAPO_FRET_PENALTY


def _detect_tuning(chords: set[str]) -> str:
    """Infer the tuning implied by the raw chord labels.

    Args:
        chords: The distinct raw chord labels.

    Returns:
        ``"Drop D"`` when a D power chord strongly implies it, else
        ``"Standard"``.
    """
    if "D5" in chords:
        return "Drop D"
    return "Standard"


def detect_capo_and_tuning(chords: list[str]) -> dict[str, str | int | list[str] | None]:
    """Detect the most likely capo position and tuning for a chord list.

    The capo is computed, not looked up: for each candidate position the
    sounding chords are transposed down and scored on open-shape friendliness,
    and the lowest capo achieving the best score wins.

    Args:
        chords: A list of chord symbols (e.g. ``["G", "D", "Em", "C"]``).

    Returns:
        A dictionary with ``"capo"`` (int), ``"tuning"`` (str) and
        ``"playedShapes"`` (the fingered shapes at the chosen capo). Empty or
        wholly unparseable input yields ``{"capo": 0, "tuning": "Standard"}``.
    """
    if not chords:
        return {"capo": 0, "tuning": "Standard"}

    shapes: set[tuple[int, bool]] = set()
    for label in chords:
        parsed = _parse_chord(label)
        if parsed is not None:
            shapes.add(parsed)

    if not shapes:
        return {"capo": 0, "tuning": "Standard"}

    best_capo = 0
    best_score = _score_capo(shapes, 0)
    for capo in range(1, _MAX_CAPO + 1):
        score = _score_capo(shapes, capo)
        if score > best_score:
            best_score = score
            best_capo = capo

    played_shapes = sorted(
        _PC_TO_NAME[(root_pc - best_capo) % 12] + ("m" if is_minor else "")
        for root_pc, is_minor in shapes
    )

    return {
        "capo": best_capo,
        "tuning": _detect_tuning(set(chords)),
        "playedShapes": played_shapes,
    }
