"""Regression coverage for cross-platform Resource Admission process-output evidence."""

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_NAME = "resource-admission-process-output-native.yml"
EXACT_SOURCE_REF = "ref: ${{ github.event.pull_request.head.sha || github.sha }}"
FOCUSED_TEST = "youtube_process_output_drains_large_stdout_and_stderr_before_exit"
FOCUSED_COMMAND = (
    "cargo +1.97.1 test --manifest-path apps/desktop/core/Cargo.toml "
    f"--lib {FOCUSED_TEST} -- --nocapture"
)
REQUIRED_OWNER_PATHS = (
    '"apps/desktop/core/Cargo.toml"',
    '"apps/desktop/core/src/root.rs"',
    '"apps/desktop/core/src/lib.rs"',
    '"apps/desktop/core/src/process_output.rs"',
    '"docs/doctoring/youtube-process-containment.md"',
    f'".github/workflows/{WORKFLOW_NAME}"',
    '"services/analysis-engine/tests/test_resource_admission_process_output_workflow_policy.py"',
)


def _workflow_text() -> str:
    return (REPO_ROOT / ".github" / "workflows" / WORKFLOW_NAME).read_text(encoding="utf-8")


def test_process_output_native_gate_runs_the_real_large_output_contract_cross_platform() -> None:
    """Exercise the same process-output contract on hosted Windows and macOS."""
    workflow = _workflow_text()

    assert "runs-on: ${{ matrix.os }}" in workflow
    assert "windows-2025" in workflow
    assert "macos-15" in workflow
    assert "fail-fast: false" in workflow
    assert FOCUSED_COMMAND in workflow
    assert "--exact" not in workflow
    assert "runtime_core::tests::" not in workflow


def test_process_output_native_gate_binds_evidence_to_the_exact_source_head() -> None:
    """Do not let GitHub's synthetic merge ref stand in for the reviewed PR head."""
    workflow = _workflow_text()

    assert EXACT_SOURCE_REF in workflow
    assert "persist-credentials: false" in workflow
    assert "rustup toolchain install 1.97.1 --profile minimal" in workflow


def test_process_output_native_gate_tracks_its_owner_inputs() -> None:
    """Any change to the focused contract must trigger fresh cross-platform evidence."""
    workflow = _workflow_text()

    for required_path in REQUIRED_OWNER_PATHS:
        assert required_path in workflow, f"process-output native gate misses {required_path}"
