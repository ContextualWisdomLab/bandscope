"""Privacy regressions for analysis-request rejection logs."""

import logging

import pytest

from bandscope_analysis.api import validate_analysis_job_request

_SECRET_MARKER = "private-super-secret"


def _local_audio_payload() -> dict[str, object]:
    """Build the smallest valid local-audio request used by log-privacy tests."""
    return {
        "sourceKind": "local_audio",
        "projectId": "project-1",
        "sourceLabel": "late-night-set.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/Users/test/Music/late-night-set.wav",
            "fileName": "late-night-set.wav",
            "extension": "wav",
            "fileSizeBytes": 1_024_000,
        },
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("projectId", f"../{_SECRET_MARKER}"),
        ("cacheRoot", f"/tmp/{_SECRET_MARKER}/../cache"),
        ("tempRoot", f"C:\\{_SECRET_MARKER}\\..\\Temp"),
    ],
)
def test_path_traversal_logs_do_not_echo_untrusted_values(
    caplog: pytest.LogCaptureFixture,
    field: str,
    value: str,
) -> None:
    """Rejected path authority logs the operation without user-controlled path text."""
    payload = _local_audio_payload()
    payload[field] = value

    with caplog.at_level(logging.WARNING, logger="bandscope_analysis.api"):
        with pytest.raises(ValueError, match="path traversal"):
            validate_analysis_job_request(payload)

    assert _SECRET_MARKER not in caplog.text
    assert "path traversal" in caplog.text
