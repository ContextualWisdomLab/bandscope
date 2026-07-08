"""Rust<->Python numerical parity gate for the ported numeric kernels.

The heavy numeric kernels (checkerboard SSM novelty and Viterbi chord decoding)
were ported to the Rust ``bandscope_numeric`` extension. These tests assert that
the Rust path and the retained NumPy reference produce equivalent results over
representative fixtures. This is the acceptance gate for the port: the observable
analysis outputs must not change.

Tolerance:
- Novelty curve (f64 continuous output): max abs diff <= 1e-6.
- Viterbi decoded states (integer output): exact equality.

When the compiled extension is not installed the tests are skipped (the engine
transparently falls back to the reference implementation).
"""

from __future__ import annotations

import numpy as np
import pytest

from bandscope_analysis._native import (
    HAVE_RUST,
    _checkerboard_novelty_rust,
    _viterbi_decode_rust,
)
from bandscope_analysis.chords.chord_recognizer import ChordRecognizer
from bandscope_analysis.sections.segmenter import _checkerboard_novelty_reference

pytestmark = pytest.mark.skipif(
    not HAVE_RUST, reason="bandscope_numeric Rust extension not installed"
)

NOVELTY_TOL = 1e-6


def _random_affinity_ssm(n: int, seed: int) -> np.ndarray:
    """Build a symmetric affinity-like SSM in [0, 1] with a unit diagonal."""
    rng = np.random.default_rng(seed)
    m = rng.random((n, n))
    m = (m + m.T) / 2.0
    np.fill_diagonal(m, 1.0)
    return np.ascontiguousarray(m, dtype=np.float64)


@pytest.mark.parametrize("n", [10, 63, 64, 65, 128, 200, 257])
@pytest.mark.parametrize("kernel_size", [16, 64])
def test_checkerboard_novelty_parity(n: int, kernel_size: int) -> None:
    """Rust checkerboard novelty matches the NumPy reference within tolerance."""
    ssm = _random_affinity_ssm(n, seed=n * 31 + kernel_size)

    rust = _checkerboard_novelty_rust(ssm, kernel_size)
    ref = _checkerboard_novelty_reference(ssm, kernel_size)

    assert rust.shape == ref.shape == (n,)
    assert np.max(np.abs(rust - ref)) <= NOVELTY_TOL


def test_checkerboard_novelty_parity_degenerate() -> None:
    """Smaller-than-kernel matrices return zeros on both paths."""
    ssm = np.ones((2, 2), dtype=np.float64)
    rust = _checkerboard_novelty_rust(ssm, 4)
    ref = _checkerboard_novelty_reference(ssm, 4)
    assert np.array_equal(rust, ref)
    assert np.array_equal(rust, np.zeros(2, dtype=np.float64))


def _random_obs_probs(n_states: int, n_frames: int, seed: int) -> np.ndarray:
    """Column-normalized observation-probability matrix, like the real pipeline."""
    rng = np.random.default_rng(seed)
    obs = rng.random((n_states, n_frames))
    obs = obs / (obs.sum(axis=0, keepdims=True) + 1e-12)
    return np.ascontiguousarray(obs, dtype=np.float64)


@pytest.mark.parametrize("n_frames", [1, 2, 5, 32, 128, 500])
def test_viterbi_decode_parity(n_frames: int) -> None:
    """Rust Viterbi decoding matches the NumPy reference exactly (integer states)."""
    recognizer = ChordRecognizer()
    n_states = recognizer._transition_matrix.shape[0]
    obs = _random_obs_probs(n_states, n_frames, seed=n_frames * 17 + 3)

    trans = np.ascontiguousarray(recognizer._transition_matrix, dtype=np.float64)
    rust = _viterbi_decode_rust(trans, obs).astype(np.intp)
    ref = recognizer._viterbi_decode_reference(obs)

    assert rust.shape == ref.shape == (n_frames,)
    assert np.array_equal(rust, ref)


def test_viterbi_decode_parity_empty() -> None:
    """Zero-frame input yields an empty state array on both paths."""
    recognizer = ChordRecognizer()
    n_states = recognizer._transition_matrix.shape[0]
    obs = np.zeros((n_states, 0), dtype=np.float64)
    trans = np.ascontiguousarray(recognizer._transition_matrix, dtype=np.float64)

    rust = _viterbi_decode_rust(trans, obs).astype(np.intp)
    ref = recognizer._viterbi_decode_reference(obs)
    assert rust.shape == ref.shape == (0,)


def test_default_path_uses_rust_and_matches_reference() -> None:
    """The public kernels (default Rust path) agree with the reference oracle."""
    from bandscope_analysis.sections.segmenter import _checkerboard_novelty

    ssm = _random_affinity_ssm(150, seed=7)
    assert np.max(np.abs(_checkerboard_novelty(ssm) - _checkerboard_novelty_reference(ssm))) <= (
        NOVELTY_TOL
    )

    recognizer = ChordRecognizer()
    obs = _random_obs_probs(recognizer._transition_matrix.shape[0], 64, seed=9)
    assert np.array_equal(
        recognizer._viterbi_decode(obs), recognizer._viterbi_decode_reference(obs)
    )
