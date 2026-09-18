"""Preregistration policy for functional-label ACC interpretation semantics."""

from __future__ import annotations

import copy

import pytest

from test_structure_noninferiority_policy import _metrics, _registration, _validator


_FUNCTIONAL_ACC_CONTRACT = {
    "frame_size_seconds": 0.1,
    "frame_grid_contract_version": 1.0,
    "annotation_contract_version": 1.0,
    "label_mapping_contract_version": 1.0,
}


def _functional_metric(registration: dict[str, object]) -> dict[str, object]:
    """Return the functional-label metric configuration from one registration."""
    metric = _metrics(registration)["functional_label_accuracy"]
    assert isinstance(metric, dict)
    return metric


def test_functional_label_accuracy_freezes_frame_and_annotation_semantics() -> None:
    """ACC cannot be preregistered without one exact frame/parser/mapping contract."""
    validator = _validator()
    registration = _registration()
    _functional_metric(registration).update(_FUNCTIONAL_ACC_CONTRACT)

    validator.validate_registration(registration)

    for field in _FUNCTIONAL_ACC_CONTRACT:
        missing = copy.deepcopy(registration)
        del _functional_metric(missing)[field]
        with pytest.raises(ValueError, match=field):
            validator.validate_registration(missing)


def test_functional_label_accuracy_rejects_post_hoc_contract_drift() -> None:
    """Frame resolution and interpretation versions are fixed before results."""
    validator = _validator()
    registration = _registration()
    _functional_metric(registration).update(_FUNCTIONAL_ACC_CONTRACT)

    drifted_frame = copy.deepcopy(registration)
    _functional_metric(drifted_frame)["frame_size_seconds"] = 0.01
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
