"""Optional Rust-accelerated numeric kernels with a pure-Python fallback.

The heavy numeric kernels of the analysis engine (checkerboard SSM novelty and
Viterbi chord decoding) are ported to Rust in the ``bandscope_numeric``
extension (built via maturin/PyO3). This module wires those kernels in as the
default execution path while keeping the pure-Python/NumPy reference
implementations available for parity testing and as a runtime fallback when the
compiled extension is not installed.

The Rust and Python paths are asserted to be numerically equivalent to a tight
f64 tolerance in ``tests/test_numeric_parity.py`` — the observable analysis
results are unchanged; only the execution backend moves to Rust.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from numpy.typing import NDArray

logger = logging.getLogger(__name__)

HAVE_RUST: bool
_checkerboard_novelty_rust: Optional[Callable[..., NDArray[Any]]]
_viterbi_decode_rust: Optional[Callable[..., NDArray[Any]]]

try:
    import bandscope_numeric as _rust
except ImportError:  # pragma: no cover - exercised only without the extension
    HAVE_RUST = False
    _checkerboard_novelty_rust = None
    _viterbi_decode_rust = None
    logger.debug("bandscope_numeric extension unavailable; using Python reference kernels")
else:  # pragma: no cover - exercised only with the extension installed
    HAVE_RUST = True
    _checkerboard_novelty_rust = _rust.checkerboard_novelty
    _viterbi_decode_rust = _rust.viterbi_decode
    logger.debug("bandscope_numeric Rust kernels loaded")


__all__ = [
    "HAVE_RUST",
    "_checkerboard_novelty_rust",
    "_viterbi_decode_rust",
]
