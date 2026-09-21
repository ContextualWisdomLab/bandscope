"""Contracts for preregistered structure-lane latency and peak-RSS evidence."""

from __future__ import annotations

import struct
from fractions import Fraction
from types import ModuleType

import pytest
from conftest import load_module


def _measurement_module() -> ModuleType:
    """Load the repository-owned isolated performance measurement boundary."""
    return load_module(
        "scripts/research/measure_structure_lane_resources.py",
        "measure_structure_lane_resources",
    )


def _validator_module() -> ModuleType:
    """Load the metric-aware registration validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_for_performance_contract",
    )


def test_performance_contract_is_part_of_metric_aware_registration_identity() -> None:
    """Latency and RSS semantics must be frozen before candidate evidence exists."""
    measurement = _measurement_module()
    validator = _validator_module()

    assert validator.STRUCTURE_METRIC_CONTRACT["performance_measurement"] == (
        measurement.PERFORMANCE_MEASUREMENT_CONTRACT
    )
    assert measurement.PERFORMANCE_MEASUREMENT_CONTRACT == {
        "contract_id": "isolated-single-shot-v1",
        "supported_platforms": ["darwin", "win32"],
        "warmup_trials": 0,
        "measured_trials": 20,
        "trial_process": "fresh_subprocess_per_lane_trial",
        "lane_order": "alternate_baseline_candidate_by_trial_index",
        "timer": "time.perf_counter_ns",
        "timer_scope": "repository_structure_segmenter_only",
        "worker_startup_in_latency": False,
        "input_transfer_in_latency": False,
        "latency_quantiles": [0.5, 0.95],
        "quantile_method": "linear",
        "memory_metric": "process_peak_resident_set_size",
        "memory_scope": "entire_worker_process_lifetime_including_pcm_input",
        "peak_rss_aggregation": "maximum_across_trials",
    }


@pytest.mark.parametrize(
    ("field", "drifted_value"),
    (
        ("contract_id", "isolated-single-shot-v2"),
        ("measured_trials", 19),
        ("lane_order", "baseline_then_candidate"),
        ("latency_quantiles", [0.5, 0.9]),
        ("quantile_method", "nearest"),
    ),
)
def test_performance_measurement_contract_drift_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    drifted_value: object,
) -> None:
    """Reject preregistration metadata that no longer describes runtime measurement semantics."""
    module = _measurement_module()
    drifted_contract = dict(module.PERFORMANCE_MEASUREMENT_CONTRACT)
    drifted_contract[field] = drifted_value
    monkeypatch.setattr(module, "PERFORMANCE_MEASUREMENT_CONTRACT", drifted_contract)

    with pytest.raises(RuntimeError, match="performance measurement contract drift"):
        module._validate_performance_measurement_contract()


def test_paired_measurement_alternates_order_and_uses_linear_quantiles(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each trial is fresh, paired in order, and summarized exactly as preregistered."""
    module = _measurement_module()
    pcm = memoryview(struct.pack("<8f", *([0.0] * 8)))
    observed_order: list[str] = []
    lane_counts = {"cqt": 0, "stft": 0}

    def fake_isolated_trial(
        feature: str,
        decoded_pcm: memoryview,
        sample_rate_hz: int,
        duration_seconds: Fraction,
    ) -> object:
        assert decoded_pcm is pcm
        assert sample_rate_hz == 10
        assert duration_seconds == Fraction(4, 5)
        observed_order.append(feature)
        lane_counts[feature] += 1
        count = lane_counts[feature]
        if feature == "cqt":
            return module.IsolatedLaneTrial(
                feature=feature,
                latency_ns=count * 100_000_000,
                peak_rss_mib=100.0 + count,
            )
        return module.IsolatedLaneTrial(
            feature=feature,
            latency_ns=count * 50_000_000,
            peak_rss_mib=200.0 + count,
        )

    monkeypatch.setattr(module, "_run_isolated_trial", fake_isolated_trial)

    result = module.measure_paired_repository_lane_resources(
        pcm,
        10,
        Fraction(4, 5),
    )

    assert observed_order[:8] == [
        "cqt",
        "stft",
        "stft",
        "cqt",
        "cqt",
        "stft",
        "stft",
        "cqt",
    ]
    assert len(observed_order) == 40
    assert result.baseline.measured_trials == 20
    assert result.candidate.measured_trials == 20
    assert result.baseline.p50_latency_seconds == pytest.approx(1.05)
    assert result.baseline.p95_latency_seconds == pytest.approx(1.905)
    assert result.candidate.p50_latency_seconds == pytest.approx(0.525)
    assert result.candidate.p95_latency_seconds == pytest.approx(0.9525)
    assert result.baseline.peak_rss_mib == pytest.approx(120.0)
    assert result.candidate.peak_rss_mib == pytest.approx(220.0)


def test_paired_measurement_rejects_mutable_or_duration_mismatched_pcm() -> None:
    """Performance evidence must use the same immutable admitted PCM identity."""
    module = _measurement_module()
    raw = struct.pack("<8f", *([0.0] * 8))

    with pytest.raises(ValueError, match="read-only memoryview"):
        module.measure_paired_repository_lane_resources(
            memoryview(bytearray(raw)),
            10,
            Fraction(4, 5),
        )

    with pytest.raises(ValueError, match="duration_seconds"):
        module.measure_paired_repository_lane_resources(
            memoryview(raw),
            10,
            Fraction(1, 1),
        )
