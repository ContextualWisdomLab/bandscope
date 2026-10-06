"""Unknown request names stay private while rejection and metadata contracts remain strict."""

from __future__ import annotations

import json

import pytest
from cli_transport_fixture import local_payload, run_transport

from bandscope_analysis import api

KEYS = [
    "extra",
    "/synthetic/PRIVATE_KEY_MARKER/never-read.wav",
    "PRIVATE_KEY_MARKER\n\r\t\0\x1b\u202e\u2066끝\u2069",
    "PRIVATE_KEY_MARKER_" + "x" * 4096,
]
KEY_IDS = ["ordinary", "synthetic-path", "controls-unicode", "bounded-4115"]
REQUESTED_AT = "2026-10-05T00:00:00Z"


def expected_message(scope):
    return f"Invalid analysis job request: unknown field in '{scope}'"


def unknown_payload(tmp_path, scope, key):
    data = local_payload(tmp_path)
    target = data["request"] if scope == "root" else data["request"]["localSource"]
    target[key] = "UNKNOWN_VALUE_NOT_PUBLIC"
    return data


def expected_status(scope):
    return {
        "jobId": "cli-contract-job",
        "state": "failed",
        "requestedAt": REQUESTED_AT,
        "updatedAt": REQUESTED_AT,
        "error": {"code": "invalid_request", "message": expected_message(scope)},
    }


@pytest.mark.parametrize("scope", ["root", "localSource"])
@pytest.mark.parametrize("key", KEYS, ids=KEY_IDS)
def test_unknown_request_field_is_fixed_at_all_api_entries(tmp_path, monkeypatch, scope, key):
    data = unknown_payload(tmp_path, scope, key)

    def forbidden(*args, **kwargs):
        pytest.fail("Unknown request crossed the validation boundary")

    monkeypatch.setattr(api, "_analysis_cache_path", forbidden)
    with pytest.raises(ValueError) as error:
        api.validate_analysis_job_request(data["request"])
    assert str(error.value) == expected_message(scope)
    assert api.run_analysis_job("cli-contract-job", data["request"], REQUESTED_AT) == (
        expected_status(scope)
    )
    assert api.run_analysis_job_updates("cli-contract-job", data["request"], REQUESTED_AT) == [
        expected_status(scope)
    ]


@pytest.mark.parametrize("scope", ["root", "localSource"])
@pytest.mark.parametrize("key", KEYS, ids=KEY_IDS)
@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_unknown_request_field_is_fixed_in_actual_cli(tmp_path, scope, key, progress):
    completed, observed = run_transport(
        tmp_path, unknown_payload(tmp_path, scope, key), progress=progress
    )
    assert completed.returncode == 0
    assert completed.stderr == ""
    assert observed["trace"] == []
    assert len(completed.stdout.splitlines()) == 1
    result = json.loads(completed.stdout)
    assert set(result) == {"jobId", "state", "requestedAt", "updatedAt", "error"}
    assert result["jobId"] == "cli-contract-job"
    assert result["state"] == "failed"
    assert result["requestedAt"] == result["updatedAt"]
    assert result["error"] == {
        "code": "invalid_request",
        "message": expected_message(scope),
    }
    assert "PRIVATE_KEY_MARKER" not in completed.stdout
    assert "UNKNOWN_VALUE_NOT_PUBLIC" not in completed.stdout


@pytest.mark.parametrize("scope", ["root", "localSource"])
@pytest.mark.parametrize("key", [False, 7, ("tuple-key",)], ids=["bool", "int", "tuple"])
def test_direct_python_nonstring_keys_are_fixed_errors(tmp_path, monkeypatch, scope, key):
    data = unknown_payload(tmp_path, scope, key)

    def forbidden(*args, **kwargs):
        pytest.fail("Non-string request key crossed the validation boundary")

    monkeypatch.setattr(api, "_analysis_cache_path", forbidden)
    with pytest.raises(ValueError) as error:
        api.validate_analysis_job_request(data["request"])
    assert str(error.value) == expected_message(scope)
    assert api.run_analysis_job("cli-contract-job", data["request"], REQUESTED_AT) == (
        expected_status(scope)
    )
    assert api.run_analysis_job_updates("cli-contract-job", data["request"], REQUESTED_AT) == [
        expected_status(scope)
    ]


@pytest.mark.parametrize("scope", ["root", "localSource"])
def test_direct_python_string_subclass_keys_are_not_schema_keys(tmp_path, scope):
    class StringKey(str):
        pass

    data = local_payload(tmp_path)
    target = data["request"] if scope == "root" else data["request"]["localSource"]
    field = "sourceLabel" if scope == "root" else "fileName"
    value = target.pop(field)
    target[StringKey(field)] = value
    with pytest.raises(ValueError) as error:
        api.validate_analysis_job_request(data["request"])
    assert str(error.value) == expected_message(scope)
    assert api.run_analysis_job("cli-contract-job", data["request"], REQUESTED_AT) == (
        expected_status(scope)
    )
    assert api.run_analysis_job_updates("cli-contract-job", data["request"], REQUESTED_AT) == [
        expected_status(scope)
    ]


@pytest.mark.parametrize("field", ["sourceKind", "extension"])
@pytest.mark.parametrize("value", [[], {}], ids=["list-value", "dict-value"])
def test_known_field_diagnostics_remain_meaningful(tmp_path, field, value):
    data = local_payload(tmp_path)
    target = data["request"] if field == "sourceKind" else data["request"]["localSource"]
    target[field] = value
    qualified = field if field == "sourceKind" else "localSource.extension"
    result = api.run_analysis_job("cli-contract-job", data["request"], REQUESTED_AT)
    assert result["state"] == "failed"
    assert result["error"] == {
        "code": "invalid_request",
        "message": f"Invalid analysis job request: invalid field '{qualified}'",
    }


def test_authorized_metadata_round_trip_is_unchanged(tmp_path):
    request = local_payload(tmp_path)["request"]
    request["sourceLabel"] = "Authorized label\n\u202e끝"
    request["localSource"]["fileName"] = "Authorized name\t끝.wav"
    request["cacheRoot"] = str(tmp_path / "never-created-cache")
    request["tempRoot"] = str(tmp_path / "never-created-temp")
    assert api.validate_analysis_job_request(request) == request
    demo = {"sourceKind": "demo", "sourceLabel": request["sourceLabel"], "roleFocus": []}
    assert api.validate_analysis_job_request(demo) == demo
