"""Regression tests for release-identity file admission boundaries."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import load_module, make_symlink_or_skip


def _write_minimal_identity_tree(repo_root: Path, version: str = "1.2.3") -> None:
    """Write the smallest canonical release-identity projections used by the guard."""
    (repo_root / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    (repo_root / "package.json").write_text(
        f'{{"version":"{version}"}}\n', encoding="utf-8"
    )
    tauri_config = repo_root / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"
    tauri_config.parent.mkdir(parents=True)
    tauri_config.write_text(f'{{"version":"{version}"}}\n', encoding="utf-8")


def test_release_identity_rejects_duplicate_json_version_projection(tmp_path: Path) -> None:
    """A parser-dependent duplicate version must not enter release identity."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        "verify_release_identity_duplicate_projection",
    )
    _write_minimal_identity_tree(tmp_path)
    (tmp_path / "package.json").write_text(
        '{"version":"9.9.9","version":"1.2.3"}\n', encoding="utf-8"
    )

    with pytest.raises(ValueError, match="duplicate JSON member"):
        verifier.verify_release_identity(tmp_path)


@pytest.mark.parametrize("constant", ["NaN", "Infinity", "-Infinity"])
def test_release_identity_rejects_nonstandard_json_constants(
    tmp_path: Path, constant: str
) -> None:
    """Release projections must remain strict JSON across consumer implementations."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        f"verify_release_identity_nonstandard_constant_{constant.replace('-', 'neg_')}",
    )
    _write_minimal_identity_tree(tmp_path)
    (tmp_path / "package.json").write_text(
        f'{{"version":"1.2.3","nonstandard":{constant}}}\n', encoding="utf-8"
    )

    with pytest.raises(ValueError, match="could not read release metadata"):
        verifier.verify_release_identity(tmp_path)


def test_release_identity_rejects_same_size_mutation_during_descriptor_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A same-length rewrite during admission must not yield a mixed file snapshot."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        "verify_release_identity_same_size_mutation",
    )
    _write_minimal_identity_tree(tmp_path)
    package_path = tmp_path / "package.json"
    original = b'{"version":"1.2.3"}\n'
    replacement = b'{"version":"9.9.9"}\n'
    assert len(original) == len(replacement)

    real_read = verifier.os.read
    mutated = False

    def mutate_after_first_package_read(descriptor: int, size: int) -> bytes:
        nonlocal mutated
        chunk = real_read(descriptor, size)
        if not mutated and chunk == original:
            package_path.write_bytes(replacement)
            mutated = True
        return chunk

    monkeypatch.setattr(verifier.os, "read", mutate_after_first_package_read)

    with pytest.raises(ValueError, match="changed while being read"):
        verifier.verify_release_identity(tmp_path)
    assert mutated


def test_release_identity_rejects_symlinked_version_authority(tmp_path: Path) -> None:
    """VERSION must be the repository file itself rather than a followed link."""
    verifier = load_module(
        "scripts/checks/verify_release_identity.py",
        "verify_release_identity_symlinked_version",
    )
    _write_minimal_identity_tree(tmp_path)
    version_path = tmp_path / "VERSION"
    version_path.unlink()
    target = tmp_path / "version-target.txt"
    target.write_text("1.2.3\n", encoding="utf-8")
    make_symlink_or_skip(version_path, target)

    with pytest.raises(ValueError, match="VERSION must be a regular non-link file"):
        verifier.verify_release_identity(tmp_path)
