"""Contract tests for authoritative first-chart-bar metadata."""

from bandscope_analysis.api import build_demo_rehearsal_song


def test_native_demo_rehearsal_song_carries_authoritative_first_bar() -> None:
    """Keep the native demo payload aligned with the browser's printed-chart fixture."""
    song = build_demo_rehearsal_song()

    assert song["sections"][0]["measureStart"] == 9
