"""Test API Fail."""
from bandscope_analysis.api import run_analysis_job_updates


def test_run_analysis_job_updates_rejects_invalid_chars():
    """Test."""
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
        },
    }
    updates = run_analysis_job_updates("123", payload, "now")
    assert updates[0]["state"] == "failed"
    assert "invalid characters" in updates[0]["error"]["message"]


def test_run_analysis_job_updates_rejects_path_traversal():
    """Test."""
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
        },
    }
    updates = run_analysis_job_updates("123", payload, "now")
    assert updates[0]["state"] == "failed"
    assert "traversal characters" in updates[0]["error"]["message"]
