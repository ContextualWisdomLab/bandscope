"""Manifest-loader policy for local MIR corpus admission."""

from __future__ import annotations

from pathlib import Path

import pytest
from test_structure_corpus_admission import _admission


def test_manifest_loader_uses_one_open_descriptor_after_path_resolution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Size admission and JSON bytes must come from one already-open regular file."""
    admission = _admission()
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        '{"schema_version":1,"registration_sha256":"abc","tracks":[]}',
        encoding="utf-8",
    )

    def reject_path_stat(_self: Path, *_args: object, **_kwargs: object) -> object:
        pytest.fail("manifest loader must use fstat on its opened descriptor")

    def reject_path_read_text(
        _self: Path, *_args: object, **_kwargs: object
    ) -> str:
        pytest.fail("manifest loader must not reopen the pathname for JSON bytes")

    monkeypatch.setattr(Path, "stat", reject_path_stat)
    monkeypatch.setattr(Path, "read_text", reject_path_read_text)

    loaded = admission._load_json(manifest)

    assert loaded["schema_version"] == 1
    assert loaded["registration_sha256"] == "abc"
    assert loaded["tracks"] == []
