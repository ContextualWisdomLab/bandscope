"""Rehearsal metric admission policy for accuracy and known-stem gates.

This module does not implement a new MIR estimator. It records the admitted
metric names, forbids rehearsal-unsafe solo scores, and keeps citation
boundaries exact so #828 can own #770 without inventing a parallel product.
"""

from __future__ import annotations

from collections.abc import Iterable

PRIMARY_SEPARATION_METRIC = "si_sdr"
PRIMARY_HARMONY_METRIC = "wcsr"
PRIMARY_BEAT_METRIC = "f_measure"
REQUIRED_TEMPO_METRICS = ("acc1", "acc2")
REHEARSAL_ONSET_TOLERANCE_SECONDS = 0.070
RAFFEL_MIR_EVAL_TEMPO_METRICS = frozenset({"p_score", "alotc"})
MIREX_TEMPO_METRICS = frozenset(REQUIRED_TEMPO_METRICS)
FORBIDDEN_SOLO_REHEARSAL_METRICS = frozenset({"acc2"})


def normalize_metric_name(name: str) -> str:
    """Return a lowercased, hyphen-stripped metric identifier."""
    return name.strip().lower().replace("-", "_")


def is_raffel_tempo_metric(name: str) -> bool:
    """Return whether the name exists in Raffel et al. (2014) mir_eval tempo.

    Raffel ``mir_eval.tempo`` exposes P-score and ALOTC. It does not define
    Acc1 or Acc2; those names belong to MIREX tempo estimation.
    """
    return normalize_metric_name(name) in RAFFEL_MIR_EVAL_TEMPO_METRICS


def is_mirex_tempo_accuracy(name: str) -> bool:
    """Return whether the name is MIREX tempo Acc1/Acc2, not a Raffel metric."""
    return normalize_metric_name(name) in MIREX_TEMPO_METRICS


def rehearsal_onset_tolerance_seconds() -> float:
    """Return the Chiu (2025) ±70 ms rehearsal onset/beat window in seconds."""
    return REHEARSAL_ONSET_TOLERANCE_SECONDS


def required_tempo_metrics() -> tuple[str, str]:
    """Return the Schreiber, Urbano, and Müller (2020) Acc1+Acc2 pair."""
    return REQUIRED_TEMPO_METRICS


def validate_rehearsal_metric_set(metrics: Iterable[str]) -> tuple[str, ...]:
    """Admit a rehearsal metric set or raise ``ValueError``.

    Acc2 alone is forbidden: Schreiber, Urbano, and Müller (2020) show that
    half/double-tempo credit hides the octave errors that wreck count-ins and
    groove lock. Harmony gates use Odekerken/MIREX WCSR. Separation gates use
    Le Roux SI-SDR as the primary score.
    """
    normalized = tuple(normalize_metric_name(name) for name in metrics if name.strip())
    if not normalized:
        raise ValueError("rehearsal metric set must not be empty")
    unique = frozenset(normalized)
    if unique <= FORBIDDEN_SOLO_REHEARSAL_METRICS:
        raise ValueError("Acc2 alone is forbidden for rehearsal acceptance")
    return normalized


def validate_tempo_metric_set(metrics: Iterable[str]) -> tuple[str, ...]:
    """Admit a tempo set only when Acc1 and Acc2 are both present.

    Raffel et al. (2014) P-score/ALOTC cannot stand in for Acc1/Acc2.
    """
    admitted = validate_rehearsal_metric_set(metrics)
    unique = frozenset(admitted)
    if unique & RAFFEL_MIR_EVAL_TEMPO_METRICS and not unique >= frozenset(REQUIRED_TEMPO_METRICS):
        raise ValueError("Raffel 2014 does not define Acc1 or Acc2")
    if not unique >= frozenset(REQUIRED_TEMPO_METRICS):
        raise ValueError("tempo acceptance requires Acc1 and Acc2")
    return admitted


def primary_metric_for_domain(domain: str) -> str:
    """Return the primary admitted metric for a registered accuracy domain."""
    key = normalize_metric_name(domain)
    if key in {"separation", "source_separation", "stems"}:
        return PRIMARY_SEPARATION_METRIC
    if key in {"harmony", "chords", "chord"}:
        return PRIMARY_HARMONY_METRIC
    if key in {"beat", "onset", "onsets"}:
        return PRIMARY_BEAT_METRIC
    if key == "tempo":
        raise ValueError("tempo requires Acc1 and Acc2; Acc2 alone is forbidden")
    raise ValueError(f"no primary rehearsal metric is registered for {domain!r}")
