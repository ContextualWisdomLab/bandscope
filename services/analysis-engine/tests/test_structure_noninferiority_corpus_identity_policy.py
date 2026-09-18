"""Focused corpus-identity regressions for the MIR evidence gate."""

from types import ModuleType

import pytest
from conftest import load_module


def _validator() -> ModuleType:
    """Load the repository-owned structure experiment validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_corpus_identity",
    )


def _track(track_id: str, audio_digest: str, annotation_digest: str) -> dict[str, object]:
    """Return one synthetic corpus identity for policy testing only."""
    return {
        "track_id": track_id,
        "audio_sha256": audio_digest,
        "annotation_sha256": annotation_digest,
        "rights_basis": "synthetic policy fixture only",
        "rights_cleared": True,
        "source_uri": f"urn:bandscope:test:{track_id}",
    }


def test_corpus_rejects_duplicate_audio_content_under_distinct_track_ids() -> None:
    """The same decoded source bytes must not be counted as independent tracks."""
    validator = _validator()
    duplicate_audio = "a" * 64
    corpus = [
        _track("track-001", duplicate_audio, "b" * 64),
        _track("track-002", duplicate_audio, "c" * 64),
    ]

    with pytest.raises(ValueError, match="duplicate audio_sha256"):
        validator._validate_corpus(corpus)


def test_corpus_accepts_distinct_audio_content_identities() -> None:
    """Distinct rights-cleared source bytes remain valid corpus members."""
    validator = _validator()
    corpus = [
        _track("track-001", "a" * 64, "b" * 64),
        _track("track-002", "c" * 64, "d" * 64),
    ]

    assert validator._validate_corpus(corpus) == ["track-001", "track-002"]
