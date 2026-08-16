"""Win32 console-device regressions for filesystem path authority."""

from __future__ import annotations

import pytest

from bandscope_analysis.path_authority import validate_local_path_shape


@pytest.mark.parametrize("device_name", ["CONIN$", "CONOUT$"])
def test_windows_console_devices_are_rejected_before_native_preflight(device_name: str) -> None:
    """Reject Win32 console device aliases as device authority, not local files."""
    value = rf"C:\Music\{device_name}"

    with pytest.raises(ValueError, match="localSource.sourcePath"):
        validate_local_path_shape(
            value,
            "localSource.sourcePath",
            preflight_native=False,
        )
