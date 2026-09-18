#!/usr/bin/env python3
"""Validate the exact research metric contract layered on structure preregistration.

This module closes the scientific adapter identity that the base noninferiority
registration did not yet bind: the content-addressed mir_eval research lock,
all explicit detection/pairwise arguments, and report-only deviation semantics.
It does not execute MIR metrics or inspect corpus outcomes.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from collections.abc import Mapping
from pathlib import Path
from types import ModuleType
from typing import Any

STRUCTURE_METRIC_RUNTIME_LOCK_SHA256 = (
    "16fd203e9c987064afc667282e001b755838ff0b484235c6932f557d2ae389f8"
)
QUALITY_METRIC_CONTRACT: dict[str, dict[str, object]] = {
    "boundary_f_0_5": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 0.5,
        "beta": 1.0,
        "trim": True,
    },
    "boundary_f_3_0": {
        "implementation": "mir_eval.segment.detection",
        "window_seconds": 3.0,
        "beta": 1.0,
        "trim": True,
    },
    "repetition_pairwise_f": {
        "implementation": "mir_eval.segment.pairwise",
        "frame_size_seconds": 0.1,
        "beta": 1.0,
    },
}
REPORT_METRIC_CONTRACT: dict[str, dict[str, object]] = {
    "boundary_deviation": {
        "implementation": "mir_eval.segment.deviation",
        "trim": True,
    }
}
_EXTENSION_FIELDS = {"metric_runtime", "report_metrics"}
_BASE_METRIC_EXTRA_FIELDS = {
    "boundary_f_0_5": {"beta", "trim"},
    "boundary_f_3_0": {"beta", "trim"},
    "repetition_pairwise_f": {"beta"},
}


def _base_validator() -> ModuleType:
    """Load the existing closed base-registration validator from this directory."""
    path = Path(__file__).with_name("validate_structure_noninferiority.py")
    spec = importlib.util.spec_from_file_location(
        "bandscope_structure_noninferiority_base",
        path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load structure noninferiority base validator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _mapping(value: object, field: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field} must be an object")
    return value


def _require_exact_fields(
    value: Mapping[str, Any],
    expected: set[str],
    field: str,
) -> None:
    actual = set(value)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        raise ValueError(f"{field} missing required field: {missing[0]}")
    if extra:
        raise ValueError(f"{field} contains unregistered field: {extra[0]}")


def _require_expected(value: object, expected: object, field: str) -> None:
    """Require an exact reviewed scalar without bool/number coercion."""
    if isinstance(expected, bool):
        if value is not expected:
            raise ValueError(f"{field} must equal {expected}")
        return
    if isinstance(expected, str):
        if value != expected:
            raise ValueError(f"{field} must equal {expected}")
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite number")
    actual = float(value)
    expected_number = float(expected)
    if not math.isfinite(actual) or not math.isclose(
        actual,
        expected_number,
        rel_tol=0.0,
        abs_tol=1e-12,
    ):
        raise ValueError(f"{field} must equal {expected}")


def _base_registration(registration: Mapping[str, Any]) -> dict[str, object]:
    """Project the extended registration onto the already-reviewed base schema."""
    base = {key: value for key, value in registration.items() if key not in _EXTENSION_FIELDS}
    metrics_value = base.get("metrics")
    if not isinstance(metrics_value, Mapping):
        return base
    metrics: dict[str, object] = {}
    for metric_name, config_value in metrics_value.items():
        if not isinstance(config_value, Mapping):
            metrics[metric_name] = config_value
            continue
        extras = _BASE_METRIC_EXTRA_FIELDS.get(metric_name, set())
        metrics[metric_name] = {
            key: value for key, value in config_value.items() if key not in extras
        }
    base["metrics"] = metrics
    return base


def validate_registration(registration_value: object) -> None:
    """Validate the base registration plus exact result-affecting metric semantics."""
    registration = _mapping(registration_value, "registration")
    expected_top_level = set(_base_registration(registration)) | _EXTENSION_FIELDS
    _require_exact_fields(registration, expected_top_level, "registration")

    metric_runtime = _mapping(registration.get("metric_runtime"), "metric_runtime")
    _require_exact_fields(metric_runtime, {"lock_sha256"}, "metric_runtime")
    if metric_runtime.get("lock_sha256") != STRUCTURE_METRIC_RUNTIME_LOCK_SHA256:
        raise ValueError(
            "metric_runtime.lock_sha256 must equal the reviewed structure metric lock"
        )

    report_metrics = _mapping(registration.get("report_metrics"), "report_metrics")
    _require_exact_fields(report_metrics, set(REPORT_METRIC_CONTRACT), "report_metrics")
    for metric_name, expected_config in REPORT_METRIC_CONTRACT.items():
        config = _mapping(report_metrics.get(metric_name), f"report_metrics.{metric_name}")
        _require_exact_fields(config, set(expected_config), f"report_metrics.{metric_name}")
        for field, expected in expected_config.items():
            _require_expected(config.get(field), expected, f"report_metrics.{metric_name}.{field}")

    metrics = _mapping(registration.get("metrics"), "metrics")
    for metric_name, expected_config in QUALITY_METRIC_CONTRACT.items():
        config = _mapping(metrics.get(metric_name), f"metrics.{metric_name}")
        for field, expected in expected_config.items():
            if field not in config:
                raise ValueError(f"metrics.{metric_name} missing required field: {field}")
            _require_expected(config.get(field), expected, f"metrics.{metric_name}.{field}")

    _base_validator().validate_registration(_base_registration(registration))


def registration_digest(registration_value: object) -> str:
    """Return the canonical SHA-256 of the complete metric-aware preregistration."""
    validate_registration(registration_value)
    canonical = json.dumps(
        registration_value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
