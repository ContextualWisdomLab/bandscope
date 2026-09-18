#!/usr/bin/env python3
"""Verify the exact research-only mir_eval runtime used by structure evidence.

The production analysis environment remains governed by the analysis-engine
``uv.lock``. Structure noninferiority evaluation adds one reviewed, pure-Python
metric wheel as a no-dependency research overlay so scientific evaluation does
not widen production dependencies. This verifier binds that overlay to the
exact PyPI artifact and the installed distribution version before any metric is
computed.

Security Notes:
- The verifier performs no network access and never installs packages.
- The lock file is size-bounded and must match the reviewed direct-wheel
  requirement exactly; mutable indexes, ranges, and alternate artifacts fail
  closed.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
from dataclasses import dataclass
from pathlib import Path

MIR_EVAL_VERSION = "0.8.2"
MIR_EVAL_WHEEL_SHA256 = (
    "114cda33d8e17408c170598e0b36ed0d71ff4a2fee8eaf9e165b58ecf1c87170"
)
MIR_EVAL_SOURCE_COMMIT = "8db0b3812e2032544c1fc00d02d4256cab043f3d"
MIR_EVAL_PYPI_TRANSPARENCY_ENTRY = 174236906
MIR_EVAL_WHEEL_URL = (
    "https://files.pythonhosted.org/packages/1b/5a/"
    "69ce896a32ebc8c75deae00b1fba9837567405fa6ef37b377f2e85b856ae/"
    "mir_eval-0.8.2-py3-none-any.whl"
)
MAX_LOCK_BYTES = 16 * 1024
EXPECTED_REQUIREMENT = (
    f"mir-eval @ {MIR_EVAL_WHEEL_URL}#sha256={MIR_EVAL_WHEEL_SHA256}"
)
EXPECTED_LOCK_TEXT = (
    "# BandScope structure noninferiority research-metric overlay.\n"
    "# Install only after the frozen analysis-engine environment is synced, "
    "using --no-deps.\n"
    f"# Upstream source: mir-evaluation/mir_eval@{MIR_EVAL_SOURCE_COMMIT}\n"
    f"# PyPI Sigstore transparency entry: {MIR_EVAL_PYPI_TRANSPARENCY_ENTRY}\n"
    f"{EXPECTED_REQUIREMENT}\n"
)


@dataclass(frozen=True, slots=True)
class StructureMetricRuntimeIdentity:
    """Content-addressed identity for the reviewed structure metric overlay."""

    version: str
    wheel_sha256: str
    source_commit: str
    pypi_transparency_entry: int
    lock_sha256: str


def _installed_mir_eval_version() -> str:
    """Return the installed distribution version from package metadata."""
    try:
        return importlib.metadata.version("mir_eval")
    except importlib.metadata.PackageNotFoundError as exc:
        raise RuntimeError(f"structure metrics require mir_eval {MIR_EVAL_VERSION}") from exc


def load_structure_metric_runtime_lock_identity(
    lock_path: Path,
) -> StructureMetricRuntimeIdentity:
    """Validate the immutable lock artifact without consulting the local environment."""
    raw = lock_path.read_bytes()
    if len(raw) > MAX_LOCK_BYTES:
        raise ValueError(f"structure metric runtime lock exceeds {MAX_LOCK_BYTES} bytes")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("structure metric runtime lock must be UTF-8 text") from exc

    if MIR_EVAL_WHEEL_SHA256 not in text:
        raise ValueError(
            "structure metric wheel identity does not match the reviewed artifact"
        )
    if text != EXPECTED_LOCK_TEXT:
        raise ValueError(
            "structure metric runtime lock differs from the reviewed exact contract"
        )

    return StructureMetricRuntimeIdentity(
        version=MIR_EVAL_VERSION,
        wheel_sha256=MIR_EVAL_WHEEL_SHA256,
        source_commit=MIR_EVAL_SOURCE_COMMIT,
        pypi_transparency_entry=MIR_EVAL_PYPI_TRANSPARENCY_ENTRY,
        lock_sha256=hashlib.sha256(raw).hexdigest(),
    )


def verify_structure_metric_runtime_lock(
    lock_path: Path,
) -> StructureMetricRuntimeIdentity:
    """Validate the reviewed lock artifact and installed mir_eval distribution."""
    identity = load_structure_metric_runtime_lock_identity(lock_path)
    observed_version = _installed_mir_eval_version()
    if observed_version != MIR_EVAL_VERSION:
        raise RuntimeError(
            f"structure metrics require mir_eval {MIR_EVAL_VERSION}; "
            f"observed {observed_version}"
        )
    return identity
