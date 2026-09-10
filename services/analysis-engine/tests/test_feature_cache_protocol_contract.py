"""Regression tests for the typed NumPy NPY reader boundaries."""

from __future__ import annotations

import io

import pytest

from bandscope_analysis import feature_cache_admission as admission


def test_npy_magic_reader_protocol_body_is_not_a_runtime_fallback() -> None:
    """Keep the typing-only magic-reader body explicit and unreachable in production."""
    with pytest.raises(NotImplementedError):
        admission._NpyMagicReader.__call__(object(), io.BytesIO())


def test_npy_header_reader_protocol_body_is_not_a_runtime_fallback() -> None:
    """Keep the typing-only header-reader body explicit and unreachable in production."""
    with pytest.raises(NotImplementedError):
        admission._NpyHeaderReader.__call__(object(), io.BytesIO())
