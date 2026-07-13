"""Coverage for the Rust/Python dispatch fallback in the numeric kernels.

These tests force the pure-Python fallback branch of the kernel dispatchers
(independent of whether the ``bandscope_numeric`` extension is installed) so the
fallback path is always exercised. Parity of the Rust path itself is covered in
``tests/test_numeric_parity.py``.
"""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis.chords import chord_recognizer
from bandscope_analysis.sections import segmenter


def _random_affinity_ssm(n: int, seed: int) -> np.ndarray:
    """Build a symmetric affinity-like SSM in [0, 1] with a unit diagonal."""
    rng = np.random.default_rng(seed)
    m = rng.random((n, n))
    m = (m + m.T) / 2.0
    np.fill_diagonal(m, 1.0)
    return np.ascontiguousarray(m, dtype=np.float64)


def test_checkerboard_novelty_fallback_matches_reference(monkeypatch: pytest.MonkeyPatch) -> None:
    """With Rust disabled, the dispatcher returns the NumPy reference result."""
    monkeypatch.setattr(segmenter, "HAVE_RUST", False)
    ssm = _random_affinity_ssm(140, seed=5)

    dispatched = segmenter._checkerboard_novelty(ssm)
    reference = segmenter._checkerboard_novelty_reference(ssm)

    assert np.array_equal(dispatched, reference)


def test_viterbi_decode_fallback_matches_reference(monkeypatch: pytest.MonkeyPatch) -> None:
    """With Rust disabled, the dispatcher returns the NumPy reference decode."""
    monkeypatch.setattr(chord_recognizer, "HAVE_RUST", False)
    recognizer = chord_recognizer.ChordRecognizer()

    rng = np.random.default_rng(11)
    n_states = recognizer._transition_matrix.shape[0]
    obs = rng.random((n_states, 48))
    obs = obs / obs.sum(axis=0, keepdims=True)

    dispatched = recognizer._viterbi_decode(obs)
    reference = recognizer._viterbi_decode_reference(obs)

    assert np.array_equal(dispatched, reference)
