"""Regression coverage for native Project Persistence evidence lanes."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
WINDOWS_WORKFLOW = "project-persistence-windows-native.yml"
LEGACY_WINDOWS_WORKFLOW = "project-persistence-windows.yml"
REQUIRED_NATIVE_PERSISTENCE_PATHS = (
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
    '"apps/desktop/src-tauri/src/project_load.rs"',
    '"apps/desktop/src-tauri/src/project_persistence.rs"',
    '"apps/desktop/src-tauri/src/project_root.rs"',
    '"apps/desktop/src-tauri/tests/project_persistence*.rs"',
    '"docs/traceability/project-persistence-native-ci.md"',
    '"services/analysis-engine/tests/test_project_persistence_workflow_policy.py"',
)


def _workflow_text(name: str) -> str:
    return (REPO_ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")


def _assert_tracks_native_persistence_inputs(workflow: str, lane: str) -> None:
    for required_path in REQUIRED_NATIVE_PERSISTENCE_PATHS:
        assert required_path in workflow, f"{lane} persistence workflow misses {required_path}"


def test_windows_project_persistence_gate_tracks_contract_inputs() -> None:
    """Run the Windows regression whenever a persistence contract input changes."""
    workflow = _workflow_text(WINDOWS_WORKFLOW)

    _assert_tracks_native_persistence_inputs(workflow, "Windows")
    assert f'".github/workflows/{WINDOWS_WORKFLOW}"' in workflow
    assert not (REPO_ROOT / ".github" / "workflows" / LEGACY_WINDOWS_WORKFLOW).exists()
    assert "runs-on: windows-2025" in workflow
    assert (
        "cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml "
        "--no-default-features --tests"
    ) in workflow


def test_macos_project_persistence_gate_tracks_contract_inputs() -> None:
    """Run native macOS regressions for the same persistence owner inputs."""
    workflow = _workflow_text("project-persistence-macos.yml")

    _assert_tracks_native_persistence_inputs(workflow, "macOS")
    assert "runs-on: macos-15" in workflow
    assert (
        "cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml "
        "--no-default-features --tests"
    ) in workflow
