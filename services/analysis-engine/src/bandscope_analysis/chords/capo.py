"""Capo and tuning detection heuristics."""


def detect_capo_and_tuning(chords: list[str]) -> dict[str, str | int | None]:
    """
    Detect the most likely capo position and tuning based on a list of chords.

    This is a basic heuristic that looks for common open chord shapes.

    Args:
        chords: A list of chord symbols (e.g., ['G', 'D', 'Em', 'C']).

    Returns:
        A dictionary containing 'capo' (int or None) and 'tuning' (str).
    """
    if not chords:
        return {"capo": None, "tuning": "Standard"}

    chords_set = set(chords)

    # Check for drop D indicators
    if "D5" in chords_set:
        return {"capo": 0, "tuning": "Drop D"}

    # If we see Eb, Bb, Fm, Ab, a capo on 1st fret (playing D, A, Em, G shapes) is very common
    flat_keys = {"Eb", "Bb", "Fm", "Ab"}

    if len(chords_set.intersection(flat_keys)) >= 2:
        return {"capo": 1, "tuning": "Standard"}

    # Default fallback
    return {"capo": 0, "tuning": "Standard"}
