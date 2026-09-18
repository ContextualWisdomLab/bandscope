#!/usr/bin/env python3
"""Bind preregistered CQT/STFT structure lanes to admitted PCM.

The experiment hypothesis from #1225 changes only the chroma representation
used by the repository-owned production segmentation pipeline. This adapter
turns the immutable canonical little-endian float32 PCM snapshot into a
zero-copy NumPy view, selects the registered CQT or STFT lane, and converts the
result back to the normalized functional-segment value object used by the
scientific evaluator.

It does not open paths, decode audio, download models, perform label mapping, or
choose margins, aggregation, uncertainty, or production defaults.

Security Notes:
- Input is the read-only PCM memoryview already admitted by the corpus boundary.
- No filesystem, network, subprocess, plugin-loading, or generic execution path
  is introduced here.
- Feature identity is closed-world (``cqt`` or ``stft``) and invalid values fail
  before analysis.
"""

from __future__ import annotations

import importlib.util
import math
import sys
from collections.abc import Callable
from fractions import Fraction
from pathlib import Path
from types import ModuleType
from typing import Any, Literal

import numpy as np

from bandscope_analysis.sections import segmenter

ChromaFeature = Literal["cqt", "stft"]
StructureSegmenter = Callable[[memoryview, int, Fraction], tuple[Any, ...]]


def _load_annotation_module() -> ModuleType:
    """Load the canonical research functional-segment value object."""
    module_name = "_bandscope_structure_feature_lane_annotations"
    existing = sys.modules.get(module_name)
    if existing is not None:
        return existing

    path = Path(__file__).with_name("parse_structure_functional_annotations.py")
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load functional annotation contract")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


_ANNOTATIONS = _load_annotation_module()


def _registered_feature(value: object) -> ChromaFeature:
    """Return one preregistered feature identity or fail closed."""
    if value == "cqt":
        return "cqt"
    if value == "stft":
        return "stft"
    raise ValueError("registered chroma feature must be one of: cqt, stft")


def _pcm_view(decoded_pcm: object) -> memoryview:
    """Require the immutable canonical mono-float32 handoff shape."""
    if not isinstance(decoded_pcm, memoryview) or not decoded_pcm.readonly:
        raise ValueError("decoded PCM must be a read-only memoryview")
    if not decoded_pcm.c_contiguous:
        raise ValueError("decoded PCM must be contiguous")
    if decoded_pcm.nbytes == 0 or decoded_pcm.nbytes % 4 != 0:
        raise ValueError("decoded PCM must contain non-empty mono float32 bytes")
    return decoded_pcm


def _positive_sample_rate(value: object) -> int:
    """Return a positive integer sample rate without coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("sample_rate_hz must be a positive integer")
    return value


def _boundary_fraction(value: object, field: str) -> Fraction:
    """Convert one finite production boundary float to a stable exact rational."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite numeric boundary")
    numeric = float(value)
    if not math.isfinite(numeric):
        raise ValueError(f"{field} must be a finite numeric boundary")
    return Fraction(str(numeric))


def repository_structure_segmenter(chroma_feature: object) -> StructureSegmenter:
    """Return the repository-owned lane for one preregistered chroma feature."""
    feature = _registered_feature(chroma_feature)

    def measure(
        decoded_pcm: memoryview,
        sample_rate_hz: int,
        duration_seconds: Fraction,
    ) -> tuple[Any, ...]:
        pcm = _pcm_view(decoded_pcm)
        sample_rate = _positive_sample_rate(sample_rate_hz)
        decoded_frames = pcm.nbytes // 4
        expected_duration = Fraction(decoded_frames, sample_rate)
        if duration_seconds != expected_duration:
            raise ValueError("duration_seconds must match the admitted PCM identity")

        audio = np.frombuffer(pcm, dtype="<f4")
        if audio.flags.writeable:
            raise ValueError("admitted PCM produced a mutable NumPy view")

        sections, boundary_pairs = segmenter.segment_with_boundaries(
            audio,
            sample_rate,
            float(expected_duration),
            chroma_feature=feature,
        )
        if len(sections) != len(boundary_pairs):
            raise RuntimeError("segment labels and boundary pairs must have equal length")
        if not sections:
            raise RuntimeError("structure lane returned no segments for admitted PCM")

        normalized: list[Any] = []
        previous_end = Fraction(0, 1)
        last_index = len(boundary_pairs) - 1
        for index, (section, pair) in enumerate(zip(sections, boundary_pairs, strict=True)):
            if not isinstance(section, dict):
                raise RuntimeError("structure lane returned a non-mapping section")
            label = section.get("form_label")
            if not isinstance(label, str):
                raise RuntimeError("structure lane returned a section without form_label")
            if not isinstance(pair, tuple) or len(pair) != 2:
                raise RuntimeError("structure lane returned a malformed boundary pair")

            start = _boundary_fraction(pair[0], f"segment {index} start")
            if start != previous_end:
                raise RuntimeError("structure lane returned discontinuous boundaries")
            if index == last_index:
                observed_end = _boundary_fraction(pair[1], f"segment {index} end")
                if not math.isclose(
                    float(observed_end),
                    float(expected_duration),
                    rel_tol=0.0,
                    abs_tol=1e-9,
                ):
                    raise RuntimeError("structure lane did not cover the admitted duration")
                end = expected_duration
            else:
                end = _boundary_fraction(pair[1], f"segment {index} end")
            if end <= start or end > expected_duration:
                raise RuntimeError("structure lane returned an invalid boundary interval")

            normalized.append(
                _ANNOTATIONS.FunctionalSegment(
                    start=start,
                    end=end,
                    label=label,
                )
            )
            previous_end = end

        if previous_end != expected_duration:
            raise RuntimeError("structure lane did not cover the admitted duration")
        return tuple(normalized)

    return measure
