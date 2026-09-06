"""Shared pytest helpers for analysis-engine and harness verification tests."""

from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

import pytest


def load_module(relative_path: str, module_name: str) -> ModuleType:
    """Load a repository Python module from a path outside the package root."""
    repo_root = Path(__file__).resolve().parents[3]
    module_path = repo_root / relative_path
    spec = spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_symlink_or_skip(link: Path, target: Path, *, target_is_directory: bool = False) -> None:
    """Create a symlink or skip when the local platform denies symlink creation."""
    try:
        link.symlink_to(target, target_is_directory=target_is_directory)
    except OSError as error:
        pytest.skip(f"symlink creation is unavailable in this environment: {error}")


@pytest.fixture(autouse=True)
def _preserve_mocked_demucs_unit_boundary(
    monkeypatch: pytest.MonkeyPatch,
    request: pytest.FixtureRequest,
) -> None:
    """Let separation unit tests keep their explicit fake-model boundary.

    ``test_separation.py`` replaces Demucs itself with an in-memory fake so its
    signal/shape contracts do not depend on a heavyweight checkpoint. The
    production local-model admission guard is covered separately by
    ``test_demucs_local_model_boundary.py`` and must not be bypassed there.
    """
    if request.path.name != "test_separation.py":
        return

    from bandscope_analysis.separation import audio_separator

    monkeypatch.setattr(
        audio_separator,
        "_local_demucs_checkpoint",
        lambda _model_name: Path("mocked-demucs-checkpoint"),
    )
