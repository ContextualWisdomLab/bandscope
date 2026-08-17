"""Rehearsal metric-authority contract for the known-stem / #770 slice."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DOCTORING = REPO_ROOT / "docs" / "doctoring" / "real-audio-accuracy-acceptance.md"


def test_metric_authority_forbids_acc2_alone_and_names_owners() -> None:
    """Doctoring must keep rehearsal metric owners exact and non-substitutable."""
    text = DOCTORING.read_text(encoding="utf-8")
    assert "Acc2 alone is forbidden" in text
    assert "Schreiber, Urbano, & Müller (2020)" in text
    assert "Raffel et al. (2014) MIR_EVAL does not define Acc1 or Acc2" in text
    assert "Chiu et al. (2025)" in text
    assert "±70 ms" in text
    assert "Odekerken et al. (2021)" in text
    assert "WCSR" in text
    assert "Le Roux et al. (2019)" in text
    assert "SI-SDR is the primary" in text
    assert "Schreiber, H., & Müller, M. (2020)" not in text
