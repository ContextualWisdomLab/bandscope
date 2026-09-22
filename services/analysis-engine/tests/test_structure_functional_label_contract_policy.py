"""Preregistration policy for functional-label ACC interpretation semantics."""

from __future__ import annotations

import copy

import pytest

import test_structure_noninferiority_policy as noninferiority_policy


_metrics = noninferiority_policy._metrics
_registration = noninferiority_policy._registration
_validator = noninferiority_policy._validator

_MIREX_2025_ACC_IMPLEMENTATION = (
    "ismir-mirex/mirex-evaluation@"
    "b9fa0b0b32e2145af31f35830f78fc9d09a4301b:"
    "music_structure_analysis.eval_script.calculate_accuracy"
)
_FUNCTIONAL_ACC_CONTRACT = {
    "frame_size_seconds": 0.2,
    "frame_grid_contract_version": 1.0,
    "annotation_contract_version": 1.0,
    "label_mapping_contract_version": 1.0,
}


def _functional_metric(registration: dict[str, object]) -> dict[str, object]:
    """Return the functional-label metric configuration from one registration."""
    metric = _metrics(registration)["functional_label_accuracy"]
    assert isinstance(metric, dict)
    return metric


def _registered_functional_metric() -> dict[str, object]:
    """Return a registration bound to the official MIREX 2025 ACC implementation."""
    registration = _registration()
    metric = _functional_metric(registration)
    metric["implementation"] = _MIREX_2025_ACC_IMPLEMENTATION
    metric.update(_FUNCTIONAL_ACC_CONTRACT)
    return registration


def test_functional_label_accuracy_freezes_official_grid_and_annotation_semantics() -> None:
    """ACC must pin the official 200 ms grid plus parser/mapping interpretation."""
    validator = _validator()
    registration = _registered_functional_metric()

    validator.validate_registration(registration)

    metric = _functional_metric(registration)
    assert metric["implementation"] == _MIREX_2025_ACC_IMPLEMENTATION
    for field in _FUNCTIONAL_ACC_CONTRACT:
        missing = copy.deepcopy(registration)
        del _functional_metric(missing)[field]
        with pytest.raises(ValueError, match=field):
            validator.validate_registration(missing)


def test_functional_label_accuracy_rejects_post_hoc_contract_drift() -> None:
    """Evaluator identity, frame grid, and interpretation cannot drift after registration."""
    validator = _validator()
    registration = _registered_functional_metric()

    drifted_implementation = copy.deepcopy(registration)
    _functional_metric(drifted_implementation)["implementation"] = (
        "mirex2025.frame_level_accuracy"
    )
    with pytest.raises(ValueError, match="implementation"):
        validator.validate_registration(drifted_implementation)

    drifted_frame = copy.deepcopy(registration)
    _functional_metric(drifted_frame)["frame_size_seconds"] = 0.1
    with pytest.raises(ValueError, match="frame_size_seconds"):
        validator.validate_registration(drifted_frame)

    drifted_grid = copy.deepcopy(registration)
    _functional_metric(drifted_grid)["frame_grid_contract_version"] = 2.0
    with pytest.raises(ValueError, match="frame_grid_contract_version"):
        validator.validate_registration(drifted_grid)

    drifted_parser = copy.deepcopy(registration)
    _functional_metric(drifted_parser)["annotation_contract_version"] = 2.0
    with pytest.raises(ValueError, match="annotation_contract_version"):
        validator.validate_registration(drifted_parser)

    drifted_mapping = copy.deepcopy(registration)
    _functional_metric(drifted_mapping)["label_mapping_contract_version"] = 2.0
    with pytest.raises(ValueError, match="label_mapping_contract_version"):
        validator.validate_registration(drifted_mapping)
