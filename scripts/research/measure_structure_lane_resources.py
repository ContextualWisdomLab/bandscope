#!/usr/bin/env python3
"""Measure preregistered CQT/STFT latency and peak RSS in fresh processes.

The structure experiment needs performance evidence that cannot inherit process
state from the other feature lane. Each measured observation therefore runs one
repository-owned structure segmenter call in a fresh Python subprocess. Worker
startup and PCM transport happen before the latency timer, while peak RSS covers
the worker's whole lifetime so interpreter, input, and analysis allocations are
not selectively excluded.

No warm-up iterations are used: repeating a song in one worker would create a
hot-cache path that is not the first-analysis buyer path being compared. Twenty
single-shot observations per lane are paired by track and executed in alternating
CQT/STFT order to limit deterministic order bias. The fixed count is a
preregistered engineering sampling plan, not a claim that twenty observations
make tail latency asymptotically precise.

Security Notes:
- PCM arrives only from the already-admitted immutable in-process snapshot.
- The child command is an argument array with ``shell=False`` and no generic
  command, path, URL, plugin, or network input.
- Feature identity is closed-world (``cqt`` or ``stft``).
- Scientific measurement fails closed on unsupported operating systems, worker
  stderr, malformed worker output, or non-zero worker exit.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import subprocess
import sys
import time
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from types import ModuleType
from typing import Any, Literal, Sequence

import numpy as np

ChromaFeature = Literal["cqt", "stft"]
_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
_MEASURED_TRIALS = 20

PERFORMANCE_MEASUREMENT_CONTRACT: dict[str, object] = {
    "contract_id": "isolated-single-shot-v1",
    "supported_platforms": ["darwin", "win32"],
    "warmup_trials": 0,
    "measured_trials": _MEASURED_TRIALS,
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


@dataclass(frozen=True, slots=True)
class IsolatedLaneTrial:
    """One single-shot lane observation produced by a fresh worker process."""

    feature: str
    latency_ns: int
    peak_rss_mib: float


@dataclass(frozen=True, slots=True)
class LaneResourceSummary:
    """Preregistered per-track latency quantiles and worst observed peak RSS."""

    p50_latency_seconds: float
    p95_latency_seconds: float
    peak_rss_mib: float
    measured_trials: int


@dataclass(frozen=True, slots=True)
class PairedLaneResourceEvidence:
    """Baseline/candidate performance evidence from the same admitted PCM."""

    contract_id: str
    baseline: LaneResourceSummary
    candidate: LaneResourceSummary


def _load_sibling(filename: str, module_name: str) -> ModuleType:
    """Load one repository-owned sibling script under a stable private name."""
    existing = sys.modules.get(module_name)
    if existing is not None:
        return existing
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load research module: {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


_LANES = _load_sibling(
    "measure_structure_feature_lanes.py",
    "_bandscope_structure_resource_measurement_lanes",
)


def _registered_feature(value: object) -> ChromaFeature:
    """Return one closed-world feature identity."""
    if value == "cqt":
        return "cqt"
    if value == "stft":
        return "stft"
    raise ValueError("feature must be one of: cqt, stft")


def _pcm_view(decoded_pcm: object) -> memoryview:
    """Require the immutable canonical mono-float32 admission handoff."""
    if not isinstance(decoded_pcm, memoryview) or not decoded_pcm.readonly:
        raise ValueError("decoded PCM must be a read-only memoryview")
    if not decoded_pcm.c_contiguous:
        raise ValueError("decoded PCM must be contiguous")
    if decoded_pcm.nbytes == 0 or decoded_pcm.nbytes % 4 != 0:
        raise ValueError("decoded PCM must contain non-empty mono float32 bytes")
    return decoded_pcm


def _positive_sample_rate(value: object) -> int:
    """Return one positive integer sample rate without coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("sample_rate_hz must be a positive integer")
    return value


def _duration(value: object, *, decoded_frames: int, sample_rate_hz: int) -> Fraction:
    """Require duration identity to equal admitted frames divided by sample rate."""
    if not isinstance(value, Fraction):
        raise ValueError("duration_seconds must be an exact Fraction")
    expected = Fraction(decoded_frames, sample_rate_hz)
    if value != expected:
        raise ValueError("duration_seconds must match the admitted PCM identity")
    return value


def _macos_peak_rss_mib() -> float:
    """Return Darwin process peak resident set size using getrusage kilobytes."""
    import resource

    raw_kib = int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if raw_kib <= 0:
        raise RuntimeError("Darwin getrusage returned a non-positive ru_maxrss")
    return raw_kib / 1024.0


def _windows_peak_rss_mib() -> float:
    """Return Windows PeakWorkingSetSize for the current worker process."""
    import ctypes
    from ctypes import wintypes

    class ProcessMemoryCounters(ctypes.Structure):
        """Win32 PROCESS_MEMORY_COUNTERS layout required by GetProcessMemoryInfo."""

        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [
        wintypes.HANDLE,
        ctypes.POINTER(ProcessMemoryCounters),
        wintypes.DWORD,
    ]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL

    counters = ProcessMemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    handle = kernel32.GetCurrentProcess()
    if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
        error_code = ctypes.get_last_error()
        raise OSError(error_code, "GetProcessMemoryInfo failed")
    peak_bytes = int(counters.PeakWorkingSetSize)
    if peak_bytes <= 0:
        raise RuntimeError("Windows returned a non-positive PeakWorkingSetSize")
    return peak_bytes / (1024.0 * 1024.0)


def _peak_rss_mib() -> float:
    """Read process-lifetime peak RSS with the preregistered platform API."""
    if sys.platform == "darwin":
        return _macos_peak_rss_mib()
    if sys.platform == "win32":
        return _windows_peak_rss_mib()
    raise RuntimeError(
        "isolated-single-shot-v1 supports performance evidence only on macOS or Windows"
    )


def _measure_current_process(
    feature: object,
    decoded_pcm: object,
    sample_rate_hz: object,
    duration_seconds: object,
) -> IsolatedLaneTrial:
    """Measure exactly one segmenter call inside an already-started worker."""
    normalized_feature = _registered_feature(feature)
    pcm = _pcm_view(decoded_pcm)
    sample_rate = _positive_sample_rate(sample_rate_hz)
    exact_duration = _duration(
        duration_seconds,
        decoded_frames=pcm.nbytes // 4,
        sample_rate_hz=sample_rate,
    )
    segmenter = _LANES.repository_structure_segmenter(normalized_feature)
    start_ns = time.perf_counter_ns()
    segments = segmenter(pcm, sample_rate, exact_duration)
    end_ns = time.perf_counter_ns()
    if not segments:
        raise RuntimeError("structure resource worker returned no segments")
    latency_ns = end_ns - start_ns
    if latency_ns <= 0:
        raise RuntimeError("structure resource worker measured non-positive latency")
    peak_rss_mib = _peak_rss_mib()
    if not math.isfinite(peak_rss_mib) or peak_rss_mib <= 0.0:
        raise RuntimeError("structure resource worker measured invalid peak RSS")
    return IsolatedLaneTrial(
        feature=normalized_feature,
        latency_ns=latency_ns,
        peak_rss_mib=peak_rss_mib,
    )


def _worker_command(
    feature: ChromaFeature,
    sample_rate_hz: int,
    duration_seconds: Fraction,
) -> list[str]:
    """Return the exact no-shell command for one isolated single-shot worker."""
    return [
        sys.executable,
        str(Path(__file__).resolve()),
        "--worker",
        feature,
        str(sample_rate_hz),
        str(duration_seconds.numerator),
        str(duration_seconds.denominator),
    ]


def _run_isolated_trial(
    feature: str,
    decoded_pcm: memoryview,
    sample_rate_hz: int,
    duration_seconds: Fraction,
) -> IsolatedLaneTrial:
    """Run one lane in a fresh subprocess and validate its complete JSON receipt."""
    normalized_feature = _registered_feature(feature)
    completed = subprocess.run(
        _worker_command(normalized_feature, sample_rate_hz, duration_seconds),
        input=decoded_pcm.tobytes(),
        capture_output=True,
        shell=False,
        check=False,
        cwd=_REPOSITORY_ROOT,
    )
    if completed.returncode != 0:
        diagnostic = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            "structure resource worker failed with exit code "
            f"{completed.returncode}: {diagnostic[:2000]}"
        )
    if completed.stderr:
        diagnostic = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            "structure resource worker emitted stderr during scientific measurement: "
            f"{diagnostic[:2000]}"
        )
    try:
        payload = json.loads(completed.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("structure resource worker returned malformed JSON") from exc
    if not isinstance(payload, dict) or set(payload) != {
        "feature",
        "latency_ns",
        "peak_rss_mib",
    }:
        raise RuntimeError("structure resource worker returned an unexpected receipt shape")
    if payload["feature"] != normalized_feature:
        raise RuntimeError("structure resource worker feature identity drifted")
    latency_ns = payload["latency_ns"]
    peak_rss_mib = payload["peak_rss_mib"]
    if isinstance(latency_ns, bool) or not isinstance(latency_ns, int) or latency_ns <= 0:
        raise RuntimeError("structure resource worker returned invalid latency_ns")
    if isinstance(peak_rss_mib, bool) or not isinstance(peak_rss_mib, (int, float)):
        raise RuntimeError("structure resource worker returned invalid peak_rss_mib")
    normalized_peak = float(peak_rss_mib)
    if not math.isfinite(normalized_peak) or normalized_peak <= 0.0:
        raise RuntimeError("structure resource worker returned invalid peak_rss_mib")
    return IsolatedLaneTrial(
        feature=normalized_feature,
        latency_ns=latency_ns,
        peak_rss_mib=normalized_peak,
    )


def _summarize_trials(trials: Sequence[IsolatedLaneTrial]) -> LaneResourceSummary:
    """Summarize one lane with the preregistered linear p50/p95 and maximum RSS."""
    if len(trials) != _MEASURED_TRIALS:
        raise ValueError(f"lane evidence must contain exactly {_MEASURED_TRIALS} trials")
    features = {trial.feature for trial in trials}
    if len(features) != 1:
        raise ValueError("lane evidence must contain exactly one feature identity")
    latencies = np.asarray(
        [trial.latency_ns / 1_000_000_000.0 for trial in trials],
        dtype=np.float64,
    )
    if not np.all(np.isfinite(latencies)) or np.any(latencies <= 0.0):
        raise ValueError("lane evidence contains invalid latency")
    p50, p95 = np.quantile(latencies, [0.5, 0.95], method="linear")
    peak_rss_mib = max(trial.peak_rss_mib for trial in trials)
    if not math.isfinite(peak_rss_mib) or peak_rss_mib <= 0.0:
        raise ValueError("lane evidence contains invalid peak RSS")
    return LaneResourceSummary(
        p50_latency_seconds=float(p50),
        p95_latency_seconds=float(p95),
        peak_rss_mib=float(peak_rss_mib),
        measured_trials=len(trials),
    )


def measure_paired_repository_lane_resources(
    decoded_pcm: object,
    sample_rate_hz: object,
    duration_seconds: object,
) -> PairedLaneResourceEvidence:
    """Measure paired CQT/STFT performance on the exact immutable admitted PCM."""
    pcm = _pcm_view(decoded_pcm)
    sample_rate = _positive_sample_rate(sample_rate_hz)
    exact_duration = _duration(
        duration_seconds,
        decoded_frames=pcm.nbytes // 4,
        sample_rate_hz=sample_rate,
    )
    baseline_trials: list[IsolatedLaneTrial] = []
    candidate_trials: list[IsolatedLaneTrial] = []
    for trial_index in range(_MEASURED_TRIALS):
        order: tuple[ChromaFeature, ChromaFeature]
        order = ("cqt", "stft") if trial_index % 2 == 0 else ("stft", "cqt")
        for feature in order:
            observation = _run_isolated_trial(
                feature,
                pcm,
                sample_rate,
                exact_duration,
            )
            if feature == "cqt":
                baseline_trials.append(observation)
            else:
                candidate_trials.append(observation)
    return PairedLaneResourceEvidence(
        contract_id="isolated-single-shot-v1",
        baseline=_summarize_trials(baseline_trials),
        candidate=_summarize_trials(candidate_trials),
    )


def _worker_main(argv: Sequence[str]) -> int:
    """Execute the internal stdin→single-shot→JSON worker protocol."""
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("feature", choices=("cqt", "stft"))
    parser.add_argument("sample_rate_hz", type=int)
    parser.add_argument("duration_numerator", type=int)
    parser.add_argument("duration_denominator", type=int)
    args = parser.parse_args(argv)
    if args.duration_denominator <= 0:
        raise ValueError("duration denominator must be positive")
    raw_pcm = sys.stdin.buffer.read()
    trial = _measure_current_process(
        args.feature,
        memoryview(raw_pcm),
        args.sample_rate_hz,
        Fraction(args.duration_numerator, args.duration_denominator),
    )
    print(
        json.dumps(
            {
                "feature": trial.feature,
                "latency_ns": trial.latency_ns,
                "peak_rss_mib": trial.peak_rss_mib,
            },
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    """Run only the private worker protocol; parent orchestration imports this module."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] != "--worker":
        raise SystemExit("measure_structure_lane_resources.py is an internal worker")
    return _worker_main(args[1:])


if __name__ == "__main__":
    raise SystemExit(main())
