import pytest
from bandscope_analysis.api import validate_analysis_job_request, _run_stem_separation_with_timeout

def test_validate_analysis_job_request_rejects_invalid_chars() -> None:
    payload = {
        "sourceKind": "local_audio",
        "sourceLabel": "Test",
        "roleFocus": ["vocal"],
        "projectId": "123",
        "localSource": {
            "sourcePath": "malicious;id;.wav",
            "fileName": "test",
            "extension": "wav",
            "fileSizeBytes": 1024,
        }
    }
    with pytest.raises(ValueError, match="contains invalid characters"):
        validate_analysis_job_request(payload)

def test_validate_analysis_job_request_rejects_path_traversal() -> None:
    payload = {
        "sourceKind": "local_audio",
        "sourceLabel": "Test",
        "roleFocus": ["vocal"],
        "projectId": "123",
        "localSource": {
            "sourcePath": "../../../../etc/passwd",
            "fileName": "test",
            "extension": "wav",
            "fileSizeBytes": 1024,
        }
    }
    with pytest.raises(ValueError, match="traversal characters"):
        validate_analysis_job_request(payload)

def test_run_stem_separation_rejects_invalid_chars() -> None:
    with pytest.raises(ValueError, match="Invalid source path"):
        _run_stem_separation_with_timeout("malicious;id;.wav")

def test_run_stem_separation_rejects_path_traversal() -> None:
    with pytest.raises(ValueError, match="Path traversal detected"):
        _run_stem_separation_with_timeout("../../../../etc/passwd")
