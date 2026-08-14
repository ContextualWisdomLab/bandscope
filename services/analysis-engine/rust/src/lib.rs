//! Rust numeric kernels for the BandScope analysis engine.
//!
//! These are direct, line-for-line ports of the heavy numeric Python kernels.
//! The math is intentionally NOT re-derived or "optimized" away from the
//! reference: the observable results must be identical to the pure-Python /
//! NumPy reference implementations to within f64 tolerance (see the parity
//! tests in `tests/test_numeric_parity.py`).
//!
//! Kernels ported:
//!   * `checkerboard_novelty` — checkerboard-kernel convolution along the SSM
//!     diagonal (from `sections/segmenter.py::_checkerboard_novelty`).
//!   * `viterbi_decode` — log-space Viterbi decoding of chord states
//!     (from `chords/chord_recognizer.py::_viterbi_decode`).

use ndarray::{Array1, Array2};
use numpy::{IntoPyArray, PyArray1, PyReadonlyArray2};
use pyo3::prelude::*;

/// Apply a checkerboard kernel along the SSM diagonal to detect boundaries.
///
/// Direct port of `_checkerboard_novelty`. For each valid diagonal position `i`
/// the `kernel_size x kernel_size` patch centered on the diagonal is multiplied
/// element-wise by a Foote checkerboard kernel (top-left and bottom-right
/// quadrants — within a segment — are `+1`, off-diagonal quadrants — across
/// the boundary — are `-1`) and summed, so a structural boundary produces a
/// positive novelty peak. The resulting curve is normalized by its peak
/// absolute magnitude, preserving sign.
#[pyfunction]
#[pyo3(signature = (ssm, kernel_size = 64))]
fn checkerboard_novelty<'py>(
    py: Python<'py>,
    ssm: PyReadonlyArray2<'py, f64>,
    kernel_size: usize,
) -> PyResult<Bound<'py, PyArray1<f64>>> {
    let view = ssm.as_array();
    let n = view.shape()[0];
    let half = kernel_size / 2;
    let mut novelty = Array1::<f64>::zeros(n);

    // Mirror the Python guard: matrices smaller than the kernel yield zeros.
    if n < kernel_size {
        return Ok(novelty.into_pyarray(py));
    }

    // Emit one value for every valid K×K diagonal patch. For even kernels,
    // this includes the final bottom-right patch that `half..(n - half)` omits.
    for i in half..(half + n - kernel_size + 1) {
        let mut acc = 0.0_f64;
        // patch = ssm[i-half : i+half, i-half : i+half]; sum(patch * kernel)
        for r in 0..kernel_size {
            let row = i - half + r;
            let top = r < half;
            for c in 0..kernel_size {
                let col = i - half + c;
                let left = c < half;
                // Foote kernel: +1 on the top-left and bottom-right quadrants,
                // -1 on the cross quadrants (so boundaries peak positively).
                let sign = if top == left { 1.0 } else { -1.0 };
                acc += sign * view[[row, col]];
            }
        }
        novelty[i] = acc;
    }

    // Normalize by peak absolute magnitude, preserving sign.
    let mut max_val = 0.0_f64;
    for &v in novelty.iter() {
        let a = v.abs();
        if a > max_val {
            max_val = a;
        }
    }
    if max_val > 0.0 {
        novelty.mapv_inplace(|v| v / max_val);
    }

    Ok(novelty.into_pyarray(py))
}

/// Run the Viterbi algorithm over frame observations to smooth a chord sequence.
///
/// Direct port of `_viterbi_decode`. Works in log-space (with the same `1e-12`
/// floor the reference uses) and applies a uniform initial distribution. Ties in
/// the `argmax` are broken toward the first (lowest) index, matching
/// `numpy.argmax`. Returns the best chord-state index per frame.
#[pyfunction]
fn viterbi_decode<'py>(
    py: Python<'py>,
    transition_matrix: PyReadonlyArray2<'py, f64>,
    observation_probs: PyReadonlyArray2<'py, f64>,
) -> PyResult<Bound<'py, PyArray1<i64>>> {
    let obs = observation_probs.as_array();
    let n_states = obs.shape()[0];
    let n_frames = obs.shape()[1];

    if n_frames == 0 {
        return Ok(Array1::<i64>::zeros(0).into_pyarray(py));
    }

    let trans = transition_matrix.as_array();

    // log_trans = log(transition_matrix + 1e-12); log_obs = log(obs + 1e-12)
    let mut log_trans = Array2::<f64>::zeros((n_states, n_states));
    for k in 0..n_states {
        for s in 0..n_states {
            log_trans[[k, s]] = (trans[[k, s]] + 1e-12).ln();
        }
    }
    let mut log_obs = Array2::<f64>::zeros((n_states, n_frames));
    for s in 0..n_states {
        for t in 0..n_frames {
            log_obs[[s, t]] = (obs[[s, t]] + 1e-12).ln();
        }
    }

    // Uniform initial log-probability.
    let log_pi = (1.0_f64 / n_states as f64).ln();

    let mut viterbi = Array2::<f64>::zeros((n_states, n_frames));
    let mut backpointer = Array2::<usize>::zeros((n_states, n_frames));

    // Initialization: viterbi[:, 0] = log_pi + log_obs[:, 0]
    for s in 0..n_states {
        viterbi[[s, 0]] = log_pi + log_obs[[s, 0]];
    }

    // Forward pass.
    for t in 1..n_frames {
        for s in 0..n_states {
            // trans_probs[k] = viterbi[k, t-1] + log_trans[k, s]; argmax over k.
            let mut best_k = 0usize;
            let mut best_val = viterbi[[0, t - 1]] + log_trans[[0, s]];
            for k in 1..n_states {
                let val = viterbi[[k, t - 1]] + log_trans[[k, s]];
                // Strict `>` keeps the first max, matching numpy.argmax.
                if val > best_val {
                    best_val = val;
                    best_k = k;
                }
            }
            backpointer[[s, t]] = best_k;
            viterbi[[s, t]] = best_val + log_obs[[s, t]];
        }
    }

    // Backtrace.
    let mut states = Array1::<i64>::zeros(n_frames);
    let mut last = 0usize;
    let mut last_val = viterbi[[0, n_frames - 1]];
    for s in 1..n_states {
        let val = viterbi[[s, n_frames - 1]];
        if val > last_val {
            last_val = val;
            last = s;
        }
    }
    states[n_frames - 1] = last as i64;
    for t in (0..(n_frames - 1)).rev() {
        let nxt = states[t + 1] as usize;
        states[t] = backpointer[[nxt, t + 1]] as i64;
    }

    Ok(states.into_pyarray(py))
}

#[pymodule]
fn bandscope_numeric(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(checkerboard_novelty, m)?)?;
    m.add_function(wrap_pyfunction!(viterbi_decode, m)?)?;
    m.add("__all__", vec!["checkerboard_novelty", "viterbi_decode"])?;
    Ok(())
}
