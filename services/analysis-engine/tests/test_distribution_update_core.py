"""Native contract gate for the Distribution updater decision core."""

from __future__ import annotations

import subprocess
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MANIFEST = _REPO_ROOT / "apps" / "desktop" / "distribution-core" / "Cargo.toml"


def test_distribution_update_core_native_suite_is_green() -> None:
    """Run the Rust anti-replay/rollback contract with its own locked graph."""
    completed = subprocess.run(
        [
            "cargo",
            "test",
            "--manifest-path",
            str(_MANIFEST),
            "--locked",
            "--all-targets",
        ],
        cwd=_REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )

    assert completed.returncode == 0, completed.stdout + completed.stderr
