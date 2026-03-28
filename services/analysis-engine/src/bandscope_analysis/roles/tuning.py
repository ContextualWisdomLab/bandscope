"""Tuning and setup note heuristics based on role and chords."""

from bandscope_analysis.chords.capo import detect_capo_and_tuning


def get_setup_note(role_name: str, chords: list[str]) -> str | None:
    """
    Generate a setup note (like Capo fret) for a given role based on the chords.

    Args:
        role_name: The name of the role (e.g., 'Acoustic Guitar', 'Bass Guitar').
        chords: A list of chords for the song or section.

    Returns:
        A setup string, or None if no specific setup is needed.
    """
    role_lower = role_name.lower()

    # Capo only makes sense for guitars usually
    if "guitar" in role_lower and "bass" not in role_lower:
        result = detect_capo_and_tuning(chords)
        capo = result["tuning"] if result["capo"] == 0 else f"Capo {result['capo']}"
        tuning = result["tuning"]

        if isinstance(result["capo"], int) and result["capo"] > 0:
            return f"Setup: {tuning} tuning, {capo}"
        elif tuning != "Standard":
            return f"Setup: {tuning} tuning"

    return None
