"""Numeric evidence validation for real-audio accuracy acceptance."""

from __future__ import annotations

import math
from numbers import Real


def is_finite_real(value: object) -> bool:
    """Return whether a value is a finite non-Boolean real number."""
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)
