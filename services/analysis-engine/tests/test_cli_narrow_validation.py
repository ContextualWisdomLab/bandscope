"""Coverage of the two exact-type request guards using the canonical API."""

import pytest

from bandscope_analysis.api import (
    run_analysis_job,
    run_analysis_job_updates,
    validate_analysis_job_request,
)


@pytest.mark.parametrize("field", ["sourceKind", "extension"])
@pytest.mark.parametrize("value", [[], {}], ids=["list", "dict"])
def test_unhashable_fields_use_real_validation_and_entry_envelopes(field, value):
    request = {
        "sourceKind": "local_audio",
        "projectId": "contract-project",
        "sourceLabel": "fixture.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/synthetic/never-opened.wav",
            "fileName": "fixture.wav",
            "extension": "wav",
            "fileSizeBytes": 64,
        },
    }
    target = request if field == "sourceKind" else request["localSource"]
    target[field] = value
    qualified = field if field == "sourceKind" else "localSource.extension"
    message = f"Invalid analysis job request: invalid field '{qualified}'"
    with pytest.raises(ValueError, match=f"invalid field '{qualified}'") as error:
        validate_analysis_job_request(request)
    assert str(error.value) == message
    terminal = run_analysis_job("typed-invalid", request, "2026-10-05T00:00:00Z")
    updates = list(run_analysis_job_updates("typed-invalid", request, "2026-10-05T00:00:00Z"))
    assert terminal["state"] == "failed"
    assert terminal["error"] == {"code": "invalid_request", "message": message}
    assert "result" not in terminal
    assert len(updates) == 1 and updates[0] == terminal
