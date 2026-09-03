"""Tests for rehearsal metric admission policy."""

from __future__ import annotations

import pytest

from bandscope_analysis.metrics_policy import (
    PRIMARY_BEAT_METRIC,
    PRIMARY_HARMONY_METRIC,
    PRIMARY_SEPARATION_METRIC,
    is_mirex_tempo_accuracy,
    is_raffel_tempo_metric,
    primary_metric_for_domain,
    rehearsal_onset_tolerance_seconds,
    required_tempo_metrics,
    validate_rehearsal_metric_set,
    validate_tempo_metric_set,
)


def test_acc2_alone_is_forbidden_for_rehearsal() -> None:
    """Acc2-only sets cannot pass rehearsal acceptance."""
    with pytest.raises(ValueError, match="Acc2 alone is forbidden"):
        validate_rehearsal_metric_set(["acc2"])
    with pytest.raises(ValueError, match="Acc2 alone is forbidden"):
        validate_rehearsal_metric_set(["Acc2", "acc2"])


def test_acc1_and_acc2_together_remain_visible() -> None:
    """Half/double-tempo credit may appear only beside Acc1, never alone."""
    assert validate_rehearsal_metric_set(["acc1", "acc2"]) == ("acc1", "acc2")


def test_empty_metric_set_is_rejected() -> None:
    """An empty rehearsal gate is not a pass."""
    with pytest.raises(ValueError, match="must not be empty"):
        validate_rehearsal_metric_set([])
    with pytest.raises(ValueError, match="must not be empty"):
        validate_rehearsal_metric_set(["  "])


def test_raffel_mir_eval_has_no_acc1_or_acc2() -> None:
    """Raffel 2014 tempo metrics are P-score and ALOTC, not Acc1/Acc2."""
    assert is_raffel_tempo_metric("p-score") is True
    assert is_raffel_tempo_metric("ALOTC") is True
    assert is_raffel_tempo_metric("acc1") is False
    assert is_raffel_tempo_metric("acc2") is False
    assert is_mirex_tempo_accuracy("acc1") is True
    assert is_mirex_tempo_accuracy("Acc2") is True
    assert is_mirex_tempo_accuracy("p_score") is False


def test_chiu_2025_onset_window_is_70_milliseconds() -> None:
    """Rehearsal beat/onset tolerance stays at Chiu (2025) ±70 ms."""
    assert rehearsal_onset_tolerance_seconds() == pytest.approx(0.070)


def test_le_roux_si_sdr_is_primary_separation_metric() -> None:
    """Source-separation gates use Le Roux SI-SDR as the primary score."""
    assert primary_metric_for_domain("separation") == PRIMARY_SEPARATION_METRIC
    assert PRIMARY_SEPARATION_METRIC == "si_sdr"
    assert primary_metric_for_domain("stems") == "si_sdr"
    assert primary_metric_for_domain("source_separation") == "si_sdr"


def test_odekerken_wcsr_is_primary_harmony_metric() -> None:
    """Harmony gates use Odekerken/MIREX weighted chord symbol recall."""
    assert primary_metric_for_domain("harmony") == PRIMARY_HARMONY_METRIC
    assert PRIMARY_HARMONY_METRIC == "wcsr"
    assert primary_metric_for_domain("chords") == "wcsr"
    assert primary_metric_for_domain("chord") == "wcsr"


def test_chiu_f_measure_is_primary_beat_metric() -> None:
    """Beat/onset gates use F-measure inside the Chiu ±70 ms window."""
    assert primary_metric_for_domain("beat") == PRIMARY_BEAT_METRIC
    assert PRIMARY_BEAT_METRIC == "f_measure"
    assert primary_metric_for_domain("onset") == "f_measure"
    assert primary_metric_for_domain("onsets") == "f_measure"


def test_tempo_has_no_single_primary_metric() -> None:
    """Tempo cannot collapse to Acc2 or any other single score."""
    with pytest.raises(ValueError, match="tempo requires Acc1 and Acc2"):
        primary_metric_for_domain("tempo")
    assert required_tempo_metrics() == ("acc1", "acc2")


def test_tempo_set_requires_acc1_and_acc2() -> None:
    """Schreiber/Urbano/Müller tempo admission is the Acc1+Acc2 pair."""
    assert validate_tempo_metric_set(["acc1", "acc2"]) == ("acc1", "acc2")
    with pytest.raises(ValueError, match="tempo acceptance requires Acc1 and Acc2"):
        validate_tempo_metric_set(["acc1"])
    with pytest.raises(ValueError, match="Acc2 alone is forbidden"):
        validate_tempo_metric_set(["acc2"])


def test_raffel_scores_cannot_replace_acc1_acc2() -> None:
    """Raffel P-score/ALOTC are not a rehearsal tempo pair."""
    with pytest.raises(ValueError, match="Raffel 2014 does not define Acc1 or Acc2"):
        validate_tempo_metric_set(["p-score"])
    with pytest.raises(ValueError, match="Raffel 2014 does not define Acc1 or Acc2"):
        validate_tempo_metric_set(["p_score", "alotc"])


def test_unknown_domain_has_no_invented_primary_metric() -> None:
    """Unregistered domains fail closed instead of inventing a product metric."""
    with pytest.raises(ValueError, match="no primary rehearsal metric"):
        primary_metric_for_domain("genre-embedding")


def test_si_sdr_and_wcsr_are_valid_rehearsal_sets() -> None:
    """Primary admitted scores form a valid rehearsal metric set."""
    assert validate_rehearsal_metric_set(["SI-SDR", "WCSR"]) == ("si_sdr", "wcsr")
