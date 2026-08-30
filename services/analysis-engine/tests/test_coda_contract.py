"""Regression coverage for the native demo coda contract."""

from bandscope_analysis.api import build_demo_rehearsal_song


def test_native_demo_publishes_trusted_coda_destination() -> None:
    """The packaged native demo exposes the same trusted coda as the browser demo."""
    song = build_demo_rehearsal_song()

    assert song.get("coda") == {"label": "Coda"}
