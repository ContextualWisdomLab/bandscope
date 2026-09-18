"""Tests for the preregistered functional-annotation interpretation contract."""

from __future__ import annotations

from fractions import Fraction
from types import ModuleType

import pytest
from conftest import load_module


def _parser() -> ModuleType:
    """Load the repository-owned normalized functional annotation parser."""
    return load_module(
        "scripts/research/parse_structure_functional_annotations.py",
        "parse_structure_functional_annotations",
    )


def _readonly(payload: bytes) -> memoryview:
    return memoryview(payload)


def test_parser_accepts_exact_mirex_tsv_and_preserves_rational_boundaries() -> None:
    parser = _parser()
    segments = parser.parse_functional_annotations(
        _readonly(b"0.0\t1.5\tintro\n1.5\t4.0\tverse\n"),
        decoded_frames=4000,
        sample_rate_hz=1000,
    )

    assert [(segment.start, segment.end, segment.label) for segment in segments] == [
        (Fraction(0, 1), Fraction(3, 2), "intro"),
        (Fraction(3, 2), Fraction(4, 1), "verse"),
    ]


def test_parser_rejects_mapping_freedom_and_noncanonical_labels() -> None:
    parser = _parser()
    for label in ("Verse", "verse1", "solo", "other", " verse"):
        payload = f"0.0\t1.0\t{label}\n".encode()
        with pytest.raises(ValueError, match="functional label"):
            parser.parse_functional_annotations(
                _readonly(payload),
                decoded_frames=1000,
                sample_rate_hz=1000,
            )


def test_parser_rejects_gap_overlap_and_incomplete_duration() -> None:
    parser = _parser()
    invalid_payloads = (
        b"0.0\t1.0\tintro\n1.1\t2.0\tverse\n",
        b"0.0\t1.1\tintro\n1.0\t2.0\tverse\n",
        b"0.0\t1.5\tintro\n",
    )
    for payload in invalid_payloads:
        with pytest.raises(ValueError, match="continuous|duration"):
            parser.parse_functional_annotations(
                _readonly(payload),
                decoded_frames=2000,
                sample_rate_hz=1000,
            )


def test_parser_rejects_malformed_nonfinite_or_mutable_annotation_input() -> None:
    parser = _parser()
    with pytest.raises(ValueError, match="three tab-separated"):
        parser.parse_functional_annotations(
            _readonly(b"0.0\tintro\n"),
            decoded_frames=1000,
            sample_rate_hz=1000,
        )
    with pytest.raises(ValueError, match="finite decimal"):
        parser.parse_functional_annotations(
            _readonly(b"0.0\tNaN\tintro\n"),
            decoded_frames=1000,
            sample_rate_hz=1000,
        )
    with pytest.raises(ValueError, match="read-only"):
        parser.parse_functional_annotations(
            memoryview(bytearray(b"0.0\t1.0\tintro\n")),
            decoded_frames=1000,
            sample_rate_hz=1000,
        )
