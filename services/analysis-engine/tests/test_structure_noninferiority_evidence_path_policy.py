"""Tests for structure-experiment evidence path admission."""

from __future__ import annotations

import os
from pathlib import Path
from types import ModuleType

import pytest
from conftest import load_module


def _validator() -> ModuleType:
    """Load the repository-owned structure experiment validator."""
    return load_module(
        "scripts/research/validate_structure_noninferiority.py",
        "validate_structure_noninferiority_evidence_path_policy",
    )


def test_evidence_loader_rejects_symlink_when_no_nofollow_flag(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Fallback admission must reject a link instead of following its target."""
    validator = _validator()
    evidence = tmp_path / "registration.json"
    evidence.write_text("{}", encoding="utf-8")

    if hasattr(validator.os, "O_NOFOLLOW"):
        monkeypatch.delattr(validator.os, "O_NOFOLLOW")
    monkeypatch.setattr(Path, "is_symlink", lambda self: self == evidence)

    with pytest.raises(ValueError, match="symbolic link"):
        validator._load_json(evidence)


def test_evidence_loader_uses_nofollow_when_platform_exposes_it(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """No-follow platforms must pass the kernel flag at the open boundary."""
    validator = _validator()
    evidence = tmp_path / "result.json"
    evidence.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(validator.os, "O_NOFOLLOW", 0x40000000, raising=False)
    original_open = os.open
    observed_flags: list[int] = []

    def recording_open(path: object, flags: int, *args: object, **kwargs: object) -> int:
        observed_flags.append(flags)
        return original_open(path, flags & ~0x40000000, *args, **kwargs)

    monkeypatch.setattr(validator.os, "open", recording_open)

    assert validator._load_json(evidence) == {}
    assert observed_flags
    assert observed_flags[0] & 0x40000000
