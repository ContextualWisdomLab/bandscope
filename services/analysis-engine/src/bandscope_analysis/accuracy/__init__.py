"""Real-audio accuracy acceptance helpers for BandScope rehearsal analysis.

Next action: run the Tier 1 fixture tests before claiming a harmony or tempo
result is accurate. These helpers score decoded PCM against known labels. They
do not replace Demucs stem separation or private-corpus benchmarks.
"""

from .evaluate import evaluate_c_major_file, evaluate_c_major_pcm, evaluate_click_tempo_file
from .fixtures import (
    C_MAJOR_LABEL,
    DEFAULT_CLICK_BPM,
    DEFAULT_SAMPLE_RATE,
    assert_fixture_checksum,
    read_pcm_wav,
    render_c_major_triad,
    render_click_track,
    write_pcm_wav,
)
from .manifest import (
    AccuracyCaseReport,
    build_case_report,
    parse_case_report,
    read_product_version,
)
from .metrics import duration_weighted_chord_recall, tempo_acc1

__all__ = [
    "AccuracyCaseReport",
    "C_MAJOR_LABEL",
    "DEFAULT_CLICK_BPM",
    "DEFAULT_SAMPLE_RATE",
    "assert_fixture_checksum",
    "build_case_report",
    "duration_weighted_chord_recall",
    "evaluate_c_major_file",
    "evaluate_c_major_pcm",
    "evaluate_click_tempo_file",
    "parse_case_report",
    "read_pcm_wav",
    "read_product_version",
    "render_c_major_triad",
    "render_click_track",
    "tempo_acc1",
    "write_pcm_wav",
]
