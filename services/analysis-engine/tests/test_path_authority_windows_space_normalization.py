"""Regression tests for Win32 leading-space path normalization."""

import pytest

from bandscope_analysis.path_authority import validate_local_path_shape


@pytest.mark.parametrize(
    "value",
    [
        r"C:\Music\ rehearsal.wav",
        r"C:\Music\ NUL.wav",
    ],
)
def test_windows_components_reject_leading_ascii_space_normalization(value: str) -> None:
    """Reject names whose leading ASCII space is stripped by Win32 normalization."""
    with pytest.raises(ValueError) as exc_info:
        validate_local_path_shape(
            value,
            "localSource.sourcePath",
            preflight_native=False,
        )

    assert "localSource.sourcePath" in str(exc_info.value)
    assert value not in str(exc_info.value)
