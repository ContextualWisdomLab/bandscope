"""CLI transport contracts with real API/worker/pipeline and explicit synthetic seams."""

from __future__ import annotations

import json

import pytest
from cli_transport_fixture import local_payload, run_transport

PRIVATE_MARKER = "/synthetic/private-metadata-marker.wav"

INVALID_CASES = [
    "list",
    "null",
    "number",
    "string",
    "empty_mapping",
    "extension",
    "sourcePath_number",
    "filename_mapping",
    "project_scope",
    "cache_scope",
    "temp_scope",
]


def invalid_payload(case, tmp_path):
    data = local_payload(tmp_path)
    req = data["request"]
    expected = "Invalid analysis job request: invalid field 'localSource'"
    if case in ("list", "null", "number", "string", "empty_mapping"):
        req["localSource"] = {
            "list": [],
            "null": None,
            "number": 7,
            "string": "bad",
            "empty_mapping": {},
        }[case]
        if case == "empty_mapping":
            expected = "Invalid analysis job request: invalid field 'localSource.sourcePath'"
    elif case == "extension":
        req["localSource"]["extension"] = "ogg"
        req["localSource"]["fileName"] = PRIVATE_MARKER
        expected = "Invalid analysis job request: invalid field 'localSource.extension'"
    elif case == "sourcePath_number":
        req["localSource"]["sourcePath"] = 7
        expected = "Invalid analysis job request: invalid field 'localSource.sourcePath'"
    elif case == "filename_mapping":
        req["localSource"]["fileName"] = {"diagnostic": PRIVATE_MARKER}
        expected = "Invalid analysis job request: invalid field 'localSource.fileName'"
    else:
        field = {
            "project_scope": "projectId",
            "cache_scope": "cacheRoot",
            "temp_scope": "tempRoot",
        }[case]
        req[field] = "../scope"
        expected = f"Invalid analysis job request: path traversal detected in '{field}'"
    return data, expected


def assert_invalid(completed, observed, expected):
    assert completed.returncode == 0, completed.stderr
    lines = [json.loads(line) for line in completed.stdout.splitlines()]
    assert len(lines) == 1
    response = lines[0]
    assert response["jobId"] == "cli-contract-job"
    assert response["state"] == "failed"
    assert response["error"] == {"code": "invalid_request", "message": expected}
    assert "result" not in response
    assert observed["trace"] == [], "Invalid request crossed temporal/native boundary"
    assert PRIVATE_MARKER not in completed.stdout + completed.stderr
    assert observed["noRealMLImported"]


@pytest.mark.parametrize("case", INVALID_CASES)
@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_invalid_local_scope_rejected_before_temporal_and_native(tmp_path, case, progress):
    data, expected = invalid_payload(case, tmp_path)
    completed, observed = run_transport(tmp_path, data, progress=progress)
    assert_invalid(completed, observed, expected)


@pytest.mark.parametrize("case", ["list", "null"])
def test_actual_stdin_to_main_rejects_nonmapping_source_without_exception(tmp_path, case):
    data, expected = invalid_payload(case, tmp_path)
    completed, observed = run_transport(tmp_path, data, entry="main")
    assert_invalid(completed, observed, expected)


@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_valid_intake_native_failure_is_typed_failed_not_transport_failure(tmp_path, progress):
    completed, observed = run_transport(
        tmp_path, local_payload(tmp_path), mode="native_failure", progress=progress
    )
    assert completed.returncode == 0, completed.stderr
    updates = [json.loads(line) for line in completed.stdout.splitlines()]
    terminal = updates[-1]
    assert terminal["jobId"] == "cli-contract-job"
    assert terminal["state"] == "failed"
    assert terminal["error"] == {"code": "engine_unavailable", "message": "Stem separation failed"}
    assert terminal["progressStage"] == "separate" and terminal["progressPercent"] == 45
    assert not any("result" in item or item["state"] == "succeeded" for item in updates)
    assert "private-native-detail" not in completed.stdout + completed.stderr
    assert observed["trace"].count("native.process.start") == 1
    assert observed["trace"].count("native.separator.separate") == 1
    assert observed["trace"].count("native.queue.close") == 1
    assert observed["trace"].count("native.queue.join_thread") == 1
    if progress:
        assert [(u["state"], u["progressStage"]) for u in updates] == [
            ("running", "decode"),
            ("running", "separate"),
            ("failed", "separate"),
        ]


@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_synthetic_success_real_cli_api_worker_helper_strict_pipeline(tmp_path, progress):
    completed, observed = run_transport(
        tmp_path, local_payload(tmp_path), mode="synthetic_success", progress=progress
    )
    assert completed.returncode == 0, completed.stderr
    updates = [json.loads(line) for line in completed.stdout.splitlines()]
    terminal = updates[-1]
    assert terminal["state"] == "succeeded" and "error" not in terminal
    assert terminal["progressStage"] == "ready" and terminal["progressPercent"] == 100
    assert observed["trace"].count("temporal.analyze") == 1
    assert terminal["result"]["id"] == "analyzed-song"
    assert terminal["result"]["title"] != "Late Night Set"
    role = next(
        role for role in terminal["result"]["sections"][0]["roles"] if role["id"] == "bass-guitar"
    )
    assert role["range"] == {"lowestNote": "C2", "highestNote": "C3"}
    assert role["harmony"]["chord"] == "C"
    assert observed["trace"].count("native.process.start") == 1
    assert observed["trace"].count("native.separator.separate") == 1
    assert observed["trace"].count("native.queue.close") == 1
    assert observed["noRealMLImported"]
    if progress:
        assert [u["progressStage"] for u in updates] == [
            "decode",
            "separate",
            "analyze",
            "persist",
            "ready",
        ]


@pytest.mark.parametrize("progress", [False, True])
def test_demo_control_retains_canonical_result_without_temporal_native(tmp_path, progress):
    data = {
        "jobId": "demo-control",
        "request": {"sourceKind": "demo", "sourceLabel": "Demo contract", "roleFocus": []},
    }
    completed, observed = run_transport(tmp_path, data, progress=progress)
    assert completed.returncode == 0, completed.stderr
    terminal = [json.loads(line) for line in completed.stdout.splitlines()][-1]
    assert terminal["state"] == "succeeded" and terminal["result"]["id"] == "demo-song"
    assert observed["trace"] == []


@pytest.mark.parametrize("progress", [False, True])
def test_valid_filename_is_not_a_private_path_logging_channel(tmp_path, progress):
    data = local_payload(tmp_path)
    data["request"]["localSource"]["fileName"] = PRIVATE_MARKER
    completed, observed = run_transport(tmp_path, data, mode="native_failure", progress=progress)
    assert completed.returncode == 0
    terminal = [json.loads(line) for line in completed.stdout.splitlines()][-1]
    assert terminal["state"] == "failed" and terminal["error"]["code"] == "engine_unavailable"
    assert PRIVATE_MARKER not in completed.stdout + completed.stderr


@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_temporal_exception_does_not_claim_success_or_echo_private_detail(tmp_path, progress):
    data = local_payload(tmp_path)
    data["request"]["localSource"]["fileName"] = PRIVATE_MARKER
    completed, observed = run_transport(tmp_path, data, mode="temporal_failure", progress=progress)
    assert completed.returncode == 0
    updates = [json.loads(line) for line in completed.stdout.splitlines()]
    assert updates[-1]["state"] == "failed"
    assert updates[-1]["error"] == {
        "code": "engine_unavailable",
        "message": "Stem separation failed",
    }
    assert not any("result" in update for update in updates)
    assert observed["trace"].count("temporal.analyze") == 1
    assert "private-temporal-detail" not in completed.stdout + completed.stderr
    assert PRIVATE_MARKER not in completed.stdout + completed.stderr


def test_job_file_read_error_retains_transport_exit_one_and_safe_error(tmp_path):
    completed, observed = run_transport(
        tmp_path, None, args=["--job", str(tmp_path / "absent.json")]
    )
    assert completed.returncode == 1
    response = json.loads(completed.stdout)
    assert response["state"] == "failed"
    assert response["error"] == {"code": "invalid_request", "message": "Failed to read job file"}
    assert str(tmp_path) not in completed.stdout + completed.stderr
    assert observed["trace"] == []


@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_temporal_bpm_value_cannot_echo_private_detail(tmp_path, progress):
    completed, observed = run_transport(
        tmp_path, local_payload(tmp_path), mode="temporal_private_bpm", progress=progress
    )
    assert completed.returncode == 0, completed.stderr
    assert "/synthetic/private-bpm-marker" not in completed.stdout + completed.stderr
    assert observed["trace"].count("temporal.analyze") == 1
    assert json.loads(completed.stdout.splitlines()[-1])["state"] == "failed"


@pytest.mark.parametrize("field", ["sourceKind", "extension"])
@pytest.mark.parametrize("value", [[], {}], ids=["list", "dict"])
def test_unhashable_enum_values_are_typed_invalid_at_all_api_entries(tmp_path, field, value):
    data = local_payload(tmp_path)
    target = data["request"] if field == "sourceKind" else data["request"]["localSource"]
    target[field] = value
    qualified = field if field == "sourceKind" else "localSource.extension"
    expected = f"Invalid analysis job request: invalid field '{qualified}'"
    completed, observed = run_transport(tmp_path, data, mode="api_validation")
    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout)
    assert result["validationError"] == expected
    assert result["run"]["error"] == {"code": "invalid_request", "message": expected}
    assert result["run"]["state"] == "failed"
    assert len(result["updates"]) == 1
    assert result["updates"][0]["error"] == result["run"]["error"]
    assert observed["trace"] == []


@pytest.mark.parametrize("field", ["sourceKind", "extension"])
@pytest.mark.parametrize("value", [[], {}], ids=["list", "dict"])
@pytest.mark.parametrize("progress", [False, True], ids=["json", "jsonl"])
def test_unhashable_enum_values_cli_before_temporal(tmp_path, field, value, progress):
    data = local_payload(tmp_path)
    target = data["request"] if field == "sourceKind" else data["request"]["localSource"]
    target[field] = value
    qualified = field if field == "sourceKind" else "localSource.extension"
    completed, observed = run_transport(tmp_path, data, progress=progress)
    assert_invalid(
        completed, observed, f"Invalid analysis job request: invalid field '{qualified}'"
    )
