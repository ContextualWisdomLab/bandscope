"""Native contract gates for BandScope Distribution/update Rust boundaries."""

from __future__ import annotations

import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MANIFESTS = (
    _REPO_ROOT / "apps" / "desktop" / "distribution-core" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-state" / "Cargo.toml",
    _REPO_ROOT / "apps" / "desktop" / "distribution-runtime" / "Cargo.toml",
)


def test_distribution_update_native_suites_are_green() -> None:
    """Run the locked Rust decision, durable-state, and runtime-admission contracts."""
    for manifest in _MANIFESTS:
        completed = subprocess.run(
            [
                "cargo",
                "test",
                "--manifest-path",
                str(manifest),
                "--locked",
                "--all-targets",
            ],
            cwd=_REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
            timeout=60,
        )

        assert completed.returncode == 0, (
            f"{manifest.relative_to(_REPO_ROOT)} failed:\n"
            + completed.stdout
            + completed.stderr
        )
