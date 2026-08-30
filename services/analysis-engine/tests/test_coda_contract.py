"""Regression coverage for the native demo coda contract."""

from bandscope_analysis.api import build_demo_rehearsal_song


def test_native_demo_publishes_trusted_coda_destination() -> None:
    """The packaged native demo exposes the same trusted coda as the browser demo."""
    song = build_demo_rehearsal_song()

    assert song.get("coda") == {"label": "Coda"}


def test_non_demo_fallback_does_not_invent_coda_authority() -> None:
    """Local-analysis fallback must not manufacture a coda without stored evidence."""
    song = build_demo_rehearsal_song({}, include_demo_coda=False)

    assert "coda" not in song
