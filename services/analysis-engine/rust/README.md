# bandscope_numeric

Rust (PyO3/maturin) extension holding the numeric-heavy kernels of the BandScope
analysis engine. Per the project rule that software with both Python and Rust
does its numeric/mathematical computation on the Rust side, the two hottest
pure-numeric kernels were ported from Python to Rust:

| Kernel | Rust function | Python reference (parity oracle) |
| --- | --- | --- |
| Checkerboard SSM novelty (structural segmentation) | `checkerboard_novelty` | `sections/segmenter.py::_checkerboard_novelty_reference` |
| Log-space Viterbi chord decoding | `viterbi_decode` | `chords/chord_recognizer.py::_viterbi_decode_reference` |

## Design constraints

- **Ported, not re-derived.** The Rust code is a line-for-line port of the
  reference math. Results are unchanged.
- **Parity is the acceptance gate.** `tests/test_numeric_parity.py` asserts the
  Rust output matches the NumPy reference over representative fixtures
  (novelty: `<= 1e-6` max abs diff; Viterbi states: exact equality).
- **Python reference retained.** The engine calls the Rust path by default and
  transparently falls back to the NumPy reference when the extension is not
  installed.
- **Permissive dependencies only** (PyO3, `numpy`, `ndarray` — all MIT/Apache-2.0).

## Build

```bash
# From services/analysis-engine, into the project venv:
uvx maturin build --release --manifest-path rust/Cargo.toml \
  --interpreter .venv/bin/python --out rust/dist
uv pip install --python .venv/bin/python rust/dist/*.whl
```

CI builds and installs the extension before running the Python suite, so the
Rust path (and its parity gate) is exercised on every run.
