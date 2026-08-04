"""Regression coverage for short-input checkerboard novelty reference behavior."""

import numpy as np

from bandscope_analysis.sections.segmenter import _checkerboard_novelty_reference


def test_checkerboard_novelty_reference_returns_zeros_when_kernel_is_larger() -> None:
    """Return one zero per frame when no centered checkerboard patch can fit."""
    ssm = np.array([[1.0, 0.25], [0.25, 1.0]], dtype=np.float64)

    novelty = _checkerboard_novelty_reference(ssm, kernel_size=4)

    np.testing.assert_array_equal(novelty, np.zeros(2, dtype=np.float64))
