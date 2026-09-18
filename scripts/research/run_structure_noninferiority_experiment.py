#!/usr/bin/env python3
"""Execute the frozen structure noninferiority experiment as one evidence chain.

This is the canonical orchestration boundary between corpus admission and result
admission. It refuses to run scientific measurements unless the preregistered
performance host identity matches the current host profile, then drives the
existing corpus admission, CQT/STFT admitted-track consumer, canonical paired
aggregation, and result validator without reopening corpus paths after admission.

The host profile intentionally excludes hostname, account identity, hardware
serial numbers, MAC addresses, and other machine identifiers that are not needed
to reproduce a performance claim. It binds only the supported OS/runtime class,
architecture, hardware/CPU model, and logical CPU count that can materially
change the CQT/STFT latency comparison.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import re
import subprocess
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

HOST_PROFILE_CONTRACT_ID = "structure-performance-host-v1"
_HOST_PROFILE_RE = re.compile(
    rf"^{re.escape(HOST_PROFILE_CONTRACT_ID)}:[0-9a-f]{{64}}$"
)
_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True, slots=True)
class StructureHostProfile:
    """Purpose-bound host facts that can affect scientific performance evidence."""

    contract_id: str
    platform: str
    os_release: str
    os_version: str
    machine: str
    hardware_model: str
    cpu_model: str
    logical_cpu_count: int


def _load_sibling(filename: str, module_name: str) -> ModuleType:
    """Load one repository-owned sibling script under a stable private module name."""
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


_VALIDATOR = _load_sibling(
    "validate_structure_noninferiority.py",
    "_bandscope_structure_execution_validator",
)
_ADMISSION = _load_sibling(
    "verify_structure_corpus.py",
    "_bandscope_structure_execution_admission",
)
_TRACKS = _load_sibling(
    "evaluate_admitted_structure_track.py",
    "_bandscope_structure_execution_tracks",
)
_AGGREGATION = _load_sibling(
    "aggregate_structure_noninferiority.py",
    "_bandscope_structure_execution_aggregation",
)


def _text(value: object, field: str) -> str:
    """Return stripped non-empty text without silently accepting another type."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be non-empty text")
    return value.strip()


def _positive_cpu_count(value: object) -> int:
    """Return a positive logical CPU count while rejecting booleans and coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise RuntimeError("logical CPU count must be a positive integer")
    return value


def host_profile_payload(profile: StructureHostProfile) -> dict[str, object]:
    """Return the exact canonical host-profile object used for content addressing."""
    if not isinstance(profile, StructureHostProfile):
        raise TypeError("profile must be a StructureHostProfile")
    payload = asdict(profile)
    if payload["contract_id"] != HOST_PROFILE_CONTRACT_ID:
        raise ValueError(
            f"host profile contract_id must equal {HOST_PROFILE_CONTRACT_ID}"
        )
    for field in (
        "platform",
        "os_release",
        "os_version",
        "machine",
        "hardware_model",
        "cpu_model",
    ):
        payload[field] = _text(payload[field], f"host_profile.{field}")
    payload["logical_cpu_count"] = _positive_cpu_count(payload["logical_cpu_count"])
    if payload["platform"] not in {"darwin", "win32"}:
        raise ValueError("host_profile.platform must be darwin or win32")
    return payload


def host_profile_identity(profile: StructureHostProfile) -> str:
    """Return the content-addressed preregistration value for one host profile."""
    canonical = json.dumps(
        host_profile_payload(profile),
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return f"{HOST_PROFILE_CONTRACT_ID}:{hashlib.sha256(canonical).hexdigest()}"


def _darwin_sysctl(selector: str) -> str:
    """Read one exact macOS hardware selector without invoking a shell."""
    completed = subprocess.run(
        ["/usr/sbin/sysctl", "-n", selector],
        check=False,
        capture_output=True,
        text=True,
        shell=False,
        timeout=5,
    )
    if completed.returncode != 0:
        diagnostic = " ".join(completed.stderr.split())
        raise RuntimeError(
            f"sysctl {selector} failed with exit code {completed.returncode}: "
            f"{diagnostic[:1000]}"
        )
    return _text(completed.stdout, f"sysctl.{selector}")


def _windows_registry_text(path: str, name: str) -> str:
    """Read one machine-level Windows hardware string from the local registry."""
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) as key:
            value, value_type = winreg.QueryValueEx(key, name)
    except OSError as exc:
        raise RuntimeError(f"Windows hardware registry value unavailable: {name}") from exc
    if value_type not in {winreg.REG_SZ, winreg.REG_EXPAND_SZ}:
        raise RuntimeError(f"Windows hardware registry value is not text: {name}")
    return _text(value, f"windows_registry.{name}")


def capture_host_profile() -> StructureHostProfile:
    """Capture the supported host facts needed to bind a latency/RSS claim."""
    current_platform = sys.platform
    if current_platform == "darwin":
        hardware_model = _darwin_sysctl("hw.model")
        cpu_model = _darwin_sysctl("machdep.cpu.brand_string")
    elif current_platform == "win32":
        hardware_model = _windows_registry_text(
            r"HARDWARE\DESCRIPTION\System\BIOS",
            "SystemProductName",
        )
        cpu_model = _windows_registry_text(
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            "ProcessorNameString",
        )
    else:
        raise RuntimeError(
            "structure scientific performance evidence supports only macOS or Windows"
        )

    return StructureHostProfile(
        contract_id=HOST_PROFILE_CONTRACT_ID,
        platform=current_platform,
        os_release=_text(platform.release(), "platform.release"),
        os_version=_text(platform.version(), "platform.version"),
        machine=_text(platform.machine(), "platform.machine"),
        hardware_model=hardware_model,
        cpu_model=cpu_model,
        logical_cpu_count=_positive_cpu_count(os.cpu_count()),
    )


def _registered_host_profile(registration: Mapping[str, Any]) -> str:
    """Return the one content-addressed host identity accepted for execution."""
    runtime = registration.get("runtime")
    if not isinstance(runtime, Mapping):
        raise ValueError("registration.runtime must be an object")
    expected = _text(runtime.get("host_profile"), "registration.runtime.host_profile")
    if _HOST_PROFILE_RE.fullmatch(expected) is None:
        raise ValueError(
            "registration.runtime.host_profile must be a "
            f"{HOST_PROFILE_CONTRACT_ID}:<sha256> identity"
        )
    return expected


def validate_execution_registration(registration: Mapping[str, Any]) -> str:
    """Validate scientific registration plus the canonical execution-host identity."""
    _VALIDATOR.validate_registration(registration)
    return _registered_host_profile(registration)


def _require_registered_host_profile(
    registration: Mapping[str, Any],
    observed: StructureHostProfile,
) -> str:
    """Fail before corpus access when the executing host differs from preregistration."""
    expected = validate_execution_registration(registration)
    actual = host_profile_identity(observed)
    if actual != expected:
        raise ValueError(
            "registration.runtime.host_profile does not match the executing host: "
            f"expected {expected}, got {actual}"
        )
    return actual


def _bind_admission_to_evidence(
    corpus_receipt: Mapping[str, Any],
    evidence: Sequence[Any],
) -> None:
    """Require consumer evidence identity to equal the admitted PCM/annotation receipt."""
    raw_tracks = corpus_receipt.get("tracks")
    if isinstance(raw_tracks, (str, bytes)) or not isinstance(raw_tracks, Sequence):
        raise RuntimeError("corpus receipt tracks must be an array")
    if len(raw_tracks) != len(evidence):
        raise RuntimeError("canonical consumer did not measure every admitted track")

    for index, (raw_track, observed) in enumerate(zip(raw_tracks, evidence, strict=True)):
        if not isinstance(raw_track, Mapping):
            raise RuntimeError(f"corpus receipt track {index} must be an object")
        checks = {
            "track_id": getattr(observed, "track_id", None),
            "decoded_pcm_sha256": getattr(observed, "decoded_pcm_sha256", None),
            "annotation_sha256": getattr(observed, "annotation_sha256", None),
            "decoded_frames": getattr(observed, "decoded_frames", None),
            "sample_rate_hz": getattr(observed, "sample_rate_hz", None),
        }
        for field, value in checks.items():
            if raw_track.get(field) != value:
                raise RuntimeError(
                    f"canonical track evidence drifted from corpus admission at {field}"
                )


def _result_receipt(
    registration: Mapping[str, Any],
    track_receipts: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    """Build one complete result only from canonical track receipts and aggregation."""
    uncertainty = registration.get("uncertainty")
    summary = _AGGREGATION.aggregate_complete_track_measurements(
        track_receipts,
        uncertainty=uncertainty,
    )
    corpus = registration.get("corpus")
    if isinstance(corpus, (str, bytes)) or not isinstance(corpus, Sequence):
        raise ValueError("registration.corpus must be an array")
    track_ids: list[str] = []
    for index, item in enumerate(corpus):
        if not isinstance(item, Mapping):
            raise ValueError(f"registration.corpus[{index}] must be an object")
        track_ids.append(_text(item.get("track_id"), f"registration.corpus[{index}].track_id"))

    result = {
        "schema_version": _VALIDATOR.SCHEMA_VERSION,
        "experiment_id": registration.get("experiment_id"),
        "registration_sha256": _VALIDATOR.registration_digest(registration),
        "uncertainty": uncertainty,
        "corpus_track_ids": track_ids,
        "tracks": list(track_receipts),
        "aggregate": summary["aggregate"],
        "paired_delta_ci95": summary["paired_delta_ci95"],
        "p95_latency_ratio_ci95": summary["p95_latency_ratio_ci95"],
        "failed_tracks": [],
        "claim_boundary": registration.get("claim_boundary"),
    }
    _VALIDATOR.evaluate_result(registration, result)
    return result


def execute_registered_experiment(
    registration: Mapping[str, Any],
    manifest: Mapping[str, Any],
    *,
    runtime_identity: Mapping[str, object],
    host_profile: StructureHostProfile,
    corpus_admitter: Callable[..., Mapping[str, Any]] | None = None,
    consumer: object | None = None,
) -> dict[str, object]:
    """Run the frozen admission→measurement→aggregation→decision evidence chain.

    ``corpus_admitter`` and ``consumer`` are dependency seams for unit regression
    tests only. Production CLI execution always uses repository-owned corpus
    admission and ``PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis``.
    Synthetic fixtures exercised through those seams are never production
    scientific acceptance evidence.
    """
    observed_host_identity = _require_registered_host_profile(registration, host_profile)

    active_consumer = consumer
    if active_consumer is None:
        active_consumer = _TRACKS.PairedFunctionalAccuracyTrackConsumer.for_registered_cqt_stft_hypothesis()
    admit = _ADMISSION.verify_corpus if corpus_admitter is None else corpus_admitter
    corpus_receipt = admit(
        registration,
        manifest,
        runtime_identity=runtime_identity,
        track_consumer=active_consumer,
    )
    if not isinstance(corpus_receipt, Mapping):
        raise RuntimeError("corpus admission must return an evidence object")

    evidence = getattr(active_consumer, "evidence", None)
    if isinstance(evidence, (str, bytes)) or not isinstance(evidence, Sequence):
        raise RuntimeError("canonical consumer must expose ordered evidence")
    _bind_admission_to_evidence(corpus_receipt, evidence)

    track_receipts = getattr(active_consumer, "result_track_receipts", None)
    if isinstance(track_receipts, (str, bytes)) or not isinstance(track_receipts, Sequence):
        raise RuntimeError("canonical consumer must expose result track receipts")
    result = _result_receipt(registration, track_receipts)
    decision = _VALIDATOR.evaluate_result(registration, result)

    return {
        "schema_version": 1,
        "registration_sha256": _VALIDATOR.registration_digest(registration),
        "execution_host_profile_identity": observed_host_identity,
        "execution_host_profile": host_profile_payload(host_profile),
        "corpus_receipt": dict(corpus_receipt),
        "result": result,
        "decision": decision,
    }


def main(argv: Sequence[str] | None = None) -> int:
    """Execute and atomically publish one complete path-free scientific envelope."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registration", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)

    registration = _VALIDATOR._mapping(
        _VALIDATOR._load_json(args.registration),
        "registration",
    )
    manifest = _ADMISSION._load_json(args.manifest)
    execution = execute_registered_experiment(
        registration,
        manifest,
        runtime_identity=_ADMISSION._current_runtime_identity(_REPOSITORY_ROOT),
        host_profile=capture_host_profile(),
    )
    _ADMISSION._write_receipt_atomic(args.output, execution)
    decision = execution["decision"]
    if not isinstance(decision, Mapping):
        raise RuntimeError("execution decision must be an object")
    return 0 if decision.get("passed") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
