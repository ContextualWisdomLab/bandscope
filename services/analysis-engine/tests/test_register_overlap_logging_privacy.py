"""Privacy regression for register-overlap safe-failure diagnostics."""

import logging

import numpy as np
import pytest

import bandscope_analysis.roles.overlap as overlap_module


def test_register_overlap_failure_log_omits_dependency_payload_and_traceback(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Fail-safe overlap diagnostics must not retain dependency text or tracebacks."""
    sensitive_detail = (
        "FFT failed for /private/customer/Alice/session.wav "
        "/Users/Alice/private-song.wav token=super-secret"
    )

    def fail_profile(_audio: np.ndarray, _sample_rate: int) -> dict[str, float]:
        raise RuntimeError(sensitive_detail)

    monkeypatch.setattr(overlap_module, "band_energy_profile", fail_profile)
    caplog.set_level(logging.WARNING, logger=overlap_module.__name__)

    result = overlap_module.detect_register_overlap(
        {
            "bass": np.ones(16, dtype=np.float64),
            "other": np.ones(16, dtype=np.float64),
        },
        22_050,
    )

    assert result == []
    assert "Register-overlap detection failed; returning no overlaps." in caplog.text
    assert "/private/customer/Alice/session.wav" not in caplog.text
    assert "/Users/Alice/private-song.wav" not in caplog.text
    assert "super-secret" not in caplog.text
    assert all(record.exc_info is None for record in caplog.records)
