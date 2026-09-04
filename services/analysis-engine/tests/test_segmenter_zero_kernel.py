"""Regression coverage for zero-sized checkerboard novelty kernels."""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis import _native
from bandscope_analysis.sections.segmenter import _checkerboard_novelty_reference


def _identity_similarity() -> np.ndarray:
    """Return a deterministic square self-similarity matrix."""
    return np.eye(3, dtype=np.float64)


def test_checkerboard_reference_zero_kernel_preserves_legacy_zeros() -> None:
    """A zero-sized reference kernel retains the prior all-zero curve."""
    novelty = _checkerboard_novelty_reference(_identity_similarity(), kernel_size=0)

    np.testing.assert_array_equal(novelty, np.zeros(3, dtype=np.float64))


@pytest.mark.skipif(
    not _native.HAVE_RUST or _native._checkerboard_novelty_rust is None,
    reason="Rust numeric extension is not installed",
)
def test_checkerboard_native_zero_kernel_matches_reference() -> None:
    """The Rust kernel must not panic or emit an n+1 position for size zero."""
    assert _native._checkerboard_novelty_rust is not None

    novelty = _native._checkerboard_novelty_rust(_identity_similarity(), 0)

    np.testing.assert_array_equal(novelty, np.zeros(3, dtype=np.float64))
