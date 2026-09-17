"""Tests for analysis-engine warning visibility policy."""

from __future__ import annotations

import ast
import tomllib
from pathlib import Path

_ANALYSIS_ROOT = Path(__file__).resolve().parents[1]
_AUDIO_LOADER_PATHS = (
    _ANALYSIS_ROOT / "src/bandscope_analysis/temporal/analyzer.py",
    _ANALYSIS_ROOT / "src/bandscope_analysis/transcription/api.py",
    _ANALYSIS_ROOT / "src/bandscope_analysis/separation/audio_separator.py",
)


def _is_runtime_warning_ignore(call: ast.Call) -> bool:
    """Return whether one production call hides warnings at runtime."""
    if not isinstance(call.func, ast.Attribute) or call.func.attr != "filterwarnings":
        return False
    if not call.args or not isinstance(call.args[0], ast.Constant):
        return False
    return call.args[0].value == "ignore"


def test_pytest_fails_on_unowned_compatibility_warnings() -> None:
    """Require pytest to turn unowned deprecation/future warnings into failures."""
    pyproject_path = _ANALYSIS_ROOT / "pyproject.toml"
    config = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
    filters = config["tool"]["pytest"]["ini_options"].get("filterwarnings", [])

    assert "error::DeprecationWarning" in filters
    assert "ignore::DeprecationWarning" not in filters
    assert "error::FutureWarning" in filters
    assert "ignore::FutureWarning" not in filters


def test_audio_loaders_do_not_hide_runtime_warnings() -> None:
    """Keep production audio loaders from converting warning findings into silence."""
    offenders: list[str] = []
    for path in _AUDIO_LOADER_PATHS:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        if any(
            _is_runtime_warning_ignore(node)
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
        ):
            offenders.append(str(path.relative_to(_ANALYSIS_ROOT)))

    assert offenders == []
