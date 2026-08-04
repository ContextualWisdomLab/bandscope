#!/usr/bin/env python3
"""Finalize checkerboard vectorization, add independent regressions, and self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "services/analysis-engine/src/bandscope_analysis/sections/segmenter.py"
TEST = ROOT / "services/analysis-engine/tests/test_segmenter.py"
SELF = ROOT / "scripts/ci/finalize_checkerboard_vectorization.py"
WORKFLOW = ROOT / ".github/workflows/finalize-checkerboard-vectorization.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_source(text: str) -> str:
    """Use a shared stride helper and write the contraction into the output slice."""
    text = replace_once(
        text,
        "import numpy as np\nfrom numpy.typing import NDArray\n",
        "import numpy as np\nfrom numpy.lib.stride_tricks import sliding_window_view\nfrom numpy.typing import NDArray\n",
        "stride helper import",
    )
    old = '''    # Sum each checkerboard offset across all valid diagonal windows at once.
    from numpy.lib.stride_tricks import sliding_window_view

    windows = sliding_window_view(ssm, (kernel_size, kernel_size))
    diag_windows = np.diagonal(windows, axis1=0, axis2=1)
    valid = np.einsum("ij,ijk->k", kernel, diag_windows)

    novelty[half : n - half] = valid[: n - 2 * half]
'''
    new = '''    # ``sliding_window_view`` and ``diagonal`` are zero-copy views. Restrict
    # the final window axis to the exact public output slice (even kernels have
    # one additional bottom-right window), then contract directly into novelty
    # so no K²×N temporary tensor or second O(N) result vector is materialized.
    windows = sliding_window_view(ssm, (kernel_size, kernel_size))
    valid_length = n - 2 * half
    diagonal_windows = np.diagonal(windows, axis1=0, axis2=1)[..., :valid_length]
    np.einsum(
        "ij,ijk->k",
        kernel,
        diagonal_windows,
        out=novelty[half : n - half],
        optimize=False,
    )
'''
    return replace_once(text, old, new, "bounded checkerboard contraction")


def patch_test(text: str) -> str:
    """Replace the single even-kernel test with an independent boundary matrix."""
    old = '''def test_checkerboard_novelty_matches_loop_reference() -> None:
    """Ensure diagonal vectorization preserves checkerboard novelty values."""
    rng = np.random.default_rng(42)
    ssm = rng.random((48, 48), dtype=np.float64)
    ssm = (ssm + ssm.T) / 2.0
    kernel_size = 8
    half = kernel_size // 2
    expected = np.zeros(ssm.shape[0], dtype=np.float64)

    # Foote kernel: +1 on-diagonal quadrants, -1 cross quadrants.
    kernel = np.full((kernel_size, kernel_size), -1.0, dtype=np.float64)
    kernel[:half, :half] = 1.0
    kernel[half:, half:] = 1.0
    for i in range(half, ssm.shape[0] - half):
        patch = ssm[i - half : i + half, i - half : i + half]
        expected[i] = np.sum(patch * kernel)

    max_value = np.max(np.abs(expected))
    expected = expected / max_value

    np.testing.assert_allclose(
        _checkerboard_novelty(ssm, kernel_size=kernel_size),
        expected,
        rtol=1e-12,
        atol=1e-12,
    )
'''
    new = '''def _checkerboard_loop_oracle(ssm: np.ndarray, kernel_size: int) -> np.ndarray:
    """Compute the Foote novelty curve with explicit centered patch loops."""
    n = ssm.shape[0]
    half = kernel_size // 2
    expected = np.zeros(n, dtype=np.float64)
    if n < kernel_size:
        return expected

    kernel = np.full((kernel_size, kernel_size), -1.0, dtype=np.float64)
    kernel[:half, :half] = 1.0
    kernel[half:, half:] = 1.0
    for center in range(half, n - half):
        start = center - half
        patch = ssm[start : start + kernel_size, start : start + kernel_size]
        expected[center] = float(np.sum(patch * kernel))

    max_value = float(np.max(np.abs(expected)))
    return expected / max_value if max_value > 0.0 else expected


@pytest.mark.parametrize(
    ("matrix_size", "kernel_size"),
    [(1, 1), (4, 3), (17, 4), (48, 8), (65, 64), (96, 15)],
)
def test_checkerboard_novelty_reference_matches_independent_loop(
    matrix_size: int,
    kernel_size: int,
) -> None:
    """Vectorization preserves even, odd, unit, and boundary-size kernels."""
    rng = np.random.default_rng(matrix_size * 101 + kernel_size)
    ssm = rng.random((matrix_size, matrix_size), dtype=np.float64)
    ssm = (ssm + ssm.T) / 2.0

    np.testing.assert_allclose(
        _checkerboard_novelty_reference(ssm, kernel_size=kernel_size),
        _checkerboard_loop_oracle(ssm, kernel_size),
        rtol=1e-12,
        atol=1e-12,
    )
'''
    text = replace_once(text, old, new, "independent checkerboard oracle")
    return replace_once(
        text,
        "import numpy as np\n\nfrom bandscope_analysis.sections.segmenter import (\n",
        "import numpy as np\nimport pytest\n\nfrom bandscope_analysis.sections.segmenter import (\n",
        "pytest import",
    )


def main() -> int:
    """Apply all reviewed changes only after every source fragment matches."""
    source = patch_source(SOURCE.read_text(encoding="utf-8"))
    test = patch_test(TEST.read_text(encoding="utf-8"))
    SOURCE.write_text(source, encoding="utf-8")
    TEST.write_text(test, encoding="utf-8")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
