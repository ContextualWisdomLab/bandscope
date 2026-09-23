"""Policy tests for crash-safe corpus-admission receipt persistence."""

from __future__ import annotations

import json
from pathlib import Path
from types import ModuleType

import pytest
from conftest import load_module, make_symlink_or_skip


def _admission() -> ModuleType:
    """Load the corpus-admission module under test."""
    return load_module(
        "scripts/research/verify_structure_corpus.py",
        "verify_structure_corpus_receipt_write_policy",
    )


def test_receipt_write_preserves_existing_file_when_replace_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed publication must not truncate the last complete receipt."""
    admission = _admission()
    output = tmp_path / "receipt.json"
    previous = '{"previous":true}\n'
    output.write_text(previous, encoding="utf-8")

    def fail_replace(_source: object, _destination: object) -> None:
        raise OSError("simulated atomic replace failure")

    monkeypatch.setattr(admission.os, "replace", fail_replace)

    with pytest.raises(OSError, match="simulated atomic replace failure"):
        admission._write_receipt_atomic(output, {"replacement": True})

    assert output.read_text(encoding="utf-8") == previous
    assert list(tmp_path.glob(f".{output.name}.*.tmp")) == []


def test_receipt_write_replaces_output_symlink_without_following_target(
    tmp_path: Path,
) -> None:
    """An untrusted output symlink must not redirect receipt bytes to its target."""
    admission = _admission()
    protected_target = tmp_path / "protected.txt"
    protected_target.write_text("keep-me\n", encoding="utf-8")
    output = tmp_path / "receipt.json"
    make_symlink_or_skip(output, protected_target)

    receipt = {"schema_version": 1, "registration_sha256": "a" * 64}
    admission._write_receipt_atomic(output, receipt)

    assert protected_target.read_text(encoding="utf-8") == "keep-me\n"
    assert not output.is_symlink()
    assert json.loads(output.read_text(encoding="utf-8")) == receipt
