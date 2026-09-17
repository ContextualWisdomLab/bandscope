"""Focused provenance-URI admission regressions for the MIR evidence gate."""

from types import ModuleType

import pytest
from conftest import load_module


def _validator() -> ModuleType:
    """Load the repository-owned structure experiment validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_provenance",
    )


@pytest.mark.parametrize(
    "source_uri",
    [
        "licensed-track-001.wav",
        "corpus/licensed-track-001.wav",
        "../private/licensed-track-001.wav",
        r"..\private\licensed-track-001.wav",
        r"C:private\licensed-track-001.wav",
    ],
)
def test_provenance_identity_rejects_relative_or_drive_local_paths(source_uri: str) -> None:
    """A local path must not be admitted merely because it is not absolute."""
    validator = _validator()

    with pytest.raises(ValueError, match="provenance URI"):
        validator._reject_local_path(source_uri, "corpus[0].source_uri")


@pytest.mark.parametrize(
    "source_uri",
    [
        "https://example.invalid/licensed-track-001",
        "urn:bandscope:private-benchmark:licensed-track-002",
    ],
)
def test_provenance_identity_accepts_explicit_non_file_uri(source_uri: str) -> None:
    """Explicit network or opaque provenance URIs remain admissible metadata."""
    validator = _validator()

    assert validator._reject_local_path(source_uri, "corpus[0].source_uri") == source_uri
