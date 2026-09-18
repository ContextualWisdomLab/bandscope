#!/usr/bin/env python3
"""Parse normalized functional annotations for the structure experiment.

This module owns only the preregistered annotation-interpretation boundary. It
accepts the immutable annotation snapshot already admitted by the corpus tool
and returns exact rational segment boundaries. It does not normalize source
labels, reopen corpus paths, calculate MIR metrics, or choose scientific
thresholds.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from fractions import Fraction

_ALLOWED_FUNCTIONAL_LABELS = frozenset(
    {"intro", "verse", "chorus", "bridge", "inst", "outro", "silence"}
)


@dataclass(frozen=True, slots=True)
class FunctionalSegment:
    """One normalized functional segment with exact rational boundaries."""

    start: Fraction
    end: Fraction
    label: str


def _positive_integer(value: object, field: str) -> int:
    """Return a positive integer while rejecting booleans and coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field} must be a positive integer")
    return value


def _finite_decimal(token: str, field: str) -> Fraction:
    """Parse one finite decimal token to an exact rational value."""
    if token != token.strip() or not token:
        raise ValueError(f"{field} must be a finite decimal without whitespace")
    try:
        value = Decimal(token)
    except InvalidOperation as exc:
        raise ValueError(f"{field} must be a finite decimal") from exc
    if not value.is_finite():
        raise ValueError(f"{field} must be a finite decimal")
    return Fraction(value)


def parse_functional_annotations(
    annotation_bytes: memoryview,
    *,
    decoded_frames: int,
    sample_rate_hz: int,
) -> tuple[FunctionalSegment, ...]:
    """Parse the BandScope v1 normalized three-column TSV contract.

    Each non-empty line must be ``start<TAB>end<TAB>label``. This local storage
    contract is not the MIREX 2025 submission-file syntax; it freezes the same
    start/end/label semantics before evaluation. The admitted annotation must be
    read-only, start at zero, remain gap/overlap-free, and cover the decoded
    signal exactly. Functional labels are already normalized before
    preregistration; this parser intentionally performs no case folding,
    synonym mapping, or suffix stripping.
    """
    if not isinstance(annotation_bytes, memoryview) or not annotation_bytes.readonly:
        raise ValueError("annotation input must be a read-only memoryview")

    frames = _positive_integer(decoded_frames, "decoded_frames")
    sample_rate = _positive_integer(sample_rate_hz, "sample_rate_hz")
    track_duration = Fraction(frames, sample_rate)

    try:
        text = bytes(annotation_bytes).decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("annotation input must be valid UTF-8") from exc
    lines = text.splitlines()
    if not lines:
        raise ValueError("annotation input must contain at least one segment")

    segments: list[FunctionalSegment] = []
    previous_end = Fraction(0, 1)
    for index, line in enumerate(lines, start=1):
        if not line:
            raise ValueError(f"annotation line {index} must not be blank")
        fields = line.split("\t")
        if len(fields) != 3:
            raise ValueError(
                f"annotation line {index} must contain exactly three tab-separated fields"
            )
        start_token, end_token, label = fields
        start = _finite_decimal(start_token, f"annotation line {index} start")
        end = _finite_decimal(end_token, f"annotation line {index} end")
        if label not in _ALLOWED_FUNCTIONAL_LABELS:
            raise ValueError(
                f"annotation line {index} functional label is not registered: {label!r}"
            )
        if start < 0 or end <= start:
            raise ValueError(
                f"annotation line {index} must have non-negative start and end > start"
            )
        if index == 1 and start != 0:
            raise ValueError("functional annotation must start at 0.0 seconds")
        if start != previous_end:
            raise ValueError(
                f"functional annotation must be continuous at line {index}"
            )
        if end > track_duration:
            raise ValueError(
                f"annotation line {index} exceeds decoded track duration"
            )
        segments.append(FunctionalSegment(start=start, end=end, label=label))
        previous_end = end

    if previous_end != track_duration:
        raise ValueError("functional annotation must cover the decoded track duration")
    return tuple(segments)
