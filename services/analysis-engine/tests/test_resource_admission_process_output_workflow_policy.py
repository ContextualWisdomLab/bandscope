"""Regression coverage for cross-platform Resource Admission process-output evidence."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_NAME = "resource-admission-process-output-native.yml"
EXACT_SOURCE_REF = "ref: ${{ github.event.pull_request.head.sha || github.sha }}"
HELPER_FEATURE = "process_output_test_helper"
FOCUSED_COMMAND = (
    "cargo +1.97.1 test --manifest-path apps/desktop/core/Cargo.toml "
    f"--features {HELPER_FEATURE} --test process_output_large_streams -- --nocapture"
)
ANALYSIS_ADAPTER_COMMAND = (
    "cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml "
    "--test analysis_process_terminal_containment_contract -- --nocapture"
)
FRONTEND_BUILD_COMMAND = "npm run build --workspace @bandscope/desktop"
REQUIRED_OWNER_PATHS = (
    '"apps/desktop/core/Cargo.toml"',
    '"apps/desktop/core/src/root.rs"',
    '"apps/desktop/core/src/lib.rs"',
    '"apps/desktop/core/src/owned_process.rs"',
    '"apps/desktop/core/src/process_output.rs"',
    '"apps/desktop/core/tests/process_output_large_streams.rs"',
    '"apps/desktop/core/tests/fixtures/process_output_test_helper.rs"',
    '"apps/desktop/src-tauri/Cargo.toml"',
    '"apps/desktop/src-tauri/src/main.rs"',
    '"apps/desktop/src-tauri/tests/analysis_process_terminal_containment_contract.rs"',
    '"docs/doctoring/subprocess-containment.md"',
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


def test_process_output_native_gate_runs_the_analysis_owned_process_adapter() -> None:
    """Bind the Tauri analysis call site to the same owned-process implementation."""
    workflow = _workflow_text()

    assert ANALYSIS_ADAPTER_COMMAND in workflow
    assert "Run native analysis owned-process adapter contract" in workflow


def test_process_output_native_gate_builds_the_canonical_frontend_before_tauri_context() -> None:
    """Tauri's generate_context macro requires the configured frontendDist to exist."""
    workflow = _workflow_text()

    assert "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e" in workflow
    assert 'node-version: "22.22.3"' in workflow
    assert "corepack enable npm" in workflow
    assert "npm run check:npm-runtime" in workflow
    assert "npm ci" in workflow
    assert FRONTEND_BUILD_COMMAND in workflow
    assert workflow.index(FRONTEND_BUILD_COMMAND) < workflow.index(ANALYSIS_ADAPTER_COMMAND)


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


def test_process_output_helper_is_test_only_and_feature_gated() -> None:
    """Keep the exact-limit child executable out of ordinary product/package targets."""
    manifest = (REPO_ROOT / "apps/desktop/core/Cargo.toml").read_text(encoding="utf-8")

    assert f"{HELPER_FEATURE} = []" in manifest
    assert 'name = "bandscope-process-output-test-helper"' in manifest
    assert 'path = "tests/fixtures/process_output_test_helper.rs"' in manifest
    assert f'required-features = ["{HELPER_FEATURE}"]' in manifest
