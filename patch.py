import os

file_path = "services/analysis-engine/tests/test_hits.py"
with open(file_path, "r") as f:
    content = f.read()

if "from typing import Any" not in content:
    content = content.replace(
        "import numpy as np\nfrom numpy.typing import NDArray",
        "from typing import Any\n\nimport numpy as np\nimport pytest\nfrom numpy.typing import NDArray"
    )

if "def test_detect_stop_time_error_path" not in content:
    content = content.replace(
        """def test_detect_stop_time_safe_failure_inputs() -> None:
    \"\"\"Empty, zero-length, silent, malformed, and degenerate input yield [].\"\"\"
    assert detect_stop_time({}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Shorter than one frame: no frames to analyze.
    assert detect_stop_time({"vocals": np.ones(16, dtype=np.float64)}, SR) == []
    # Degenerate sample rate: frame length collapses to zero.
    assert detect_stop_time({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_stop_time({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]


def test_detect_shared_hits_finds_aligned_impulses() -> None:""",
        """def test_detect_stop_time_safe_failure_inputs() -> None:
    \"\"\"Empty, zero-length, silent, malformed, and degenerate input yield [].\"\"\"
    assert detect_stop_time({}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_stop_time({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Shorter than one frame: no frames to analyze.
    assert detect_stop_time({"vocals": np.ones(16, dtype=np.float64)}, SR) == []
    # Degenerate sample rate: frame length collapses to zero.
    assert detect_stop_time({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_stop_time({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]


def test_detect_stop_time_error_path(monkeypatch: pytest.MonkeyPatch) -> None:
    \"\"\"An internal exception is caught and returns an empty list.\"\"\"
    def mock_detect(*args: Any, **kwargs: Any) -> list[dict[str, float]]:
        raise RuntimeError("simulated error")

    monkeypatch.setattr(
        "bandscope_analysis.temporal.hits._detect_stop_time", mock_detect
    )
    assert detect_stop_time({"vocals": _tone(1.0)}, SR) == []


def test_detect_shared_hits_finds_aligned_impulses() -> None:"""
    )

if "def test_detect_shared_hits_error_path" not in content:
    content = content.replace(
        """def test_detect_shared_hits_safe_failure_inputs() -> None:
    \"\"\"Empty, silent, malformed, and degenerate input yield [].\"\"\"
    assert detect_shared_hits({}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Degenerate sample rate must fail safe.
    assert detect_shared_hits({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_shared_hits({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]""",
        """def test_detect_shared_hits_safe_failure_inputs() -> None:
    \"\"\"Empty, silent, malformed, and degenerate input yield [].\"\"\"
    assert detect_shared_hits({}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(0, dtype=np.float64)}, SR) == []
    assert detect_shared_hits({"vocals": np.zeros(SR, dtype=np.float64)}, SR) == []
    # Degenerate sample rate must fail safe.
    assert detect_shared_hits({"vocals": _tone(1.0)}, 0) == []
    # Non-numeric array must not raise.
    assert detect_shared_hits({"vocals": np.array(["boom"])}, SR) == []  # type: ignore[dict-item]


def test_detect_shared_hits_error_path(monkeypatch: pytest.MonkeyPatch) -> None:
    \"\"\"An internal exception is caught and returns an empty list.\"\"\"
    def mock_detect(*args: Any, **kwargs: Any) -> list[dict[str, float | int]]:
        raise RuntimeError("simulated error")

    monkeypatch.setattr(
        "bandscope_analysis.temporal.hits._detect_shared_hits", mock_detect
    )
    assert detect_shared_hits({"vocals": _tone(1.0)}, SR) == []"""
    )

with open(file_path, "w") as f:
    f.write(content)
