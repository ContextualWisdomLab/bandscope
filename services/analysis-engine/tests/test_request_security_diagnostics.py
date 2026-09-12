"""Regression tests for bounded Resource Admission security diagnostics."""

from unittest.mock import patch

import pytest

from bandscope_analysis.api import validate_analysis_job_request


def test_source_path_traversal_logs_only_bounded_field_name() -> None:
    """Reject traversal while keeping attacker-controlled path bytes out of logs."""
    malicious_path = "/Users/test/../Music/late-night-set.wav\nFORGED-LOG-LINE"
    payload = {
        "sourceKind": "local_audio",
        "projectId": "project-1",
        "sourceLabel": "Late Night Set",
        "roleFocus": [],
        "localSource": {
            "sourcePath": malicious_path,
            "fileName": "late-night-set.wav",
            "extension": "wav",
            "fileSizeBytes": 1024,
        },
    }

    with patch("bandscope_analysis.api.logger.warning") as warning:
        with pytest.raises(ValueError, match="path traversal detected"):
            validate_analysis_job_request(payload)

    warning.assert_called_once_with("Security: path traversal detected in localSource.sourcePath")
    assert malicious_path not in repr(warning.call_args)
