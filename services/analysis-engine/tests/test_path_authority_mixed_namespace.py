"""Regression tests for mixed-separator Windows network/device path authority."""

from __future__ import annotations

import pytest

from bandscope_analysis.path_authority import validate_local_path_shape


@pytest.mark.parametrize(
    "value",
    [
        r"/\server\share\rehearsal.wav",
        r"\/server\share\rehearsal.wav",
        r"/\?\C:\rehearsal.wav",
        r"\/.\pipe\bandscope-job",
    ],
)
def test_validate_local_path_shape_rejects_mixed_separator_network_and_device_prefixes(
    value: str,
) -> None:
    """Reject mixed-separator UNC/device prefixes before native filesystem authority."""
    with pytest.raises(ValueError) as exc_info:
        validate_local_path_shape(
            value,
            "localSource.sourcePath",
            preflight_native=False,
        )

    assert "localSource.sourcePath" in str(exc_info.value)
    assert value not in str(exc_info.value)
