"""Regression tests for canonical project-identifier admission."""

from bandscope_analysis.api import validate_analysis_job_request


def _local_audio_request(project_id: str) -> dict[str, object]:
    """Build the smallest valid local-audio request around a project identifier."""
    return {
        "sourceKind": "local_audio",
        "projectId": project_id,
        "sourceLabel": "late-night-set.wav",
        "roleFocus": [],
        "localSource": {
            "sourcePath": "/Users/test/Music/late-night-set.wav",
            "fileName": "late-night-set.wav",
            "extension": "wav",
            "fileSizeBytes": 1_024_000,
        },
    }


def test_project_id_rejects_leading_or_trailing_whitespace() -> None:
    """Whitespace must not turn reserved or ordinary IDs into ambiguous path keys."""
    for project_id in (" .. ", " . ", " project-1 "):
        try:
            validate_analysis_job_request(_local_audio_request(project_id))
        except ValueError as error:
            assert "path traversal" in str(error)
        else:
            raise AssertionError(f"Expected ValueError for projectId={project_id!r}")


def test_project_id_preserves_valid_identifiers() -> None:
    """Reject normalization ambiguity without banning a benign '..' substring."""
    for project_id in ("project-1", "my..id"):
        result = validate_analysis_job_request(_local_audio_request(project_id))
        assert result["projectId"] == project_id
