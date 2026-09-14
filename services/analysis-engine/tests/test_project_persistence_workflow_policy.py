"""Regression coverage for the Windows Project Persistence evidence lane."""

from pathlib import Path


def test_windows_project_persistence_gate_tracks_contract_inputs() -> None:
    """Run the Windows regression whenever a persistence contract input changes."""
    repo_root = Path(__file__).resolve().parents[3]
    workflow = (repo_root / ".github" / "workflows" / "project-persistence-windows.yml").read_text(
        encoding="utf-8"
    )

    required_paths = (
        '"apps/desktop/core/Cargo.toml"',
        '"apps/desktop/core/src/lib.rs"',
        '"apps/desktop/core/src/crate_root.rs"',
        '"apps/desktop/core/src/project_format.rs"',
        '"apps/desktop/core/tests/project_persistence*.rs"',
        '"apps/desktop/core/tests/project_format*.rs"',
        '"apps/desktop/core/testdata/project-*.json"',
        '"apps/desktop/src-tauri/Cargo.toml"',
        '"apps/desktop/src-tauri/Cargo.lock"',
        '"apps/desktop/src-tauri/src/main.rs"',
        '"apps/desktop/src-tauri/src/project_persistence.rs"',
        '"apps/desktop/src-tauri/tests/project_persistence*.rs"',
    )

    for required_path in required_paths:
        assert required_path in workflow, f"Windows persistence workflow misses {required_path}"
