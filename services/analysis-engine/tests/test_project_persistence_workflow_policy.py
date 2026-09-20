"""Regression coverage for native Project Persistence evidence lanes."""

import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
CORE_TEST_ROOT = REPO_ROOT / "apps/desktop/core/tests"
WINDOWS_WORKFLOW = "project-persistence-windows-native.yml"
LEGACY_WINDOWS_WORKFLOW = "project-persistence-windows.yml"
WARNING_GATE_FEATURE = "persistence_warning_gate"
EXACT_SOURCE_REF = "ref: ${{ github.event.pull_request.head.sha || github.sha }}"
CORE_OWNER_MODULE_COMMANDS = (
    (
        "cargo +1.97.1 test --manifest-path apps/desktop/core/Cargo.toml "
        "--features persistence_warning_gate --lib score_attachment_recovery::tests::"
    ),
    (
        "cargo +1.97.1 test --manifest-path apps/desktop/core/Cargo.toml "
        "--features persistence_warning_gate --lib content_sha256::tests::"
    ),
)
TAURI_OWNER_TEST_COMMAND = (
    "cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml "
    "--no-default-features --features persistence_warning_gate --tests"
)
CORE_OWNER_TEST_PATTERNS = (
    "project_persistence*.rs",
    "project_format*.rs",
    "project_migration*.rs",
)
CORE_OWNER_EXACT_TESTS = ("content_sha256_shared_kernel.rs",)
REQUIRED_NATIVE_PERSISTENCE_PATHS = (
    '"apps/desktop/core/Cargo.toml"',
    '"apps/desktop/core/src/root.rs"',
    '"apps/desktop/core/src/lib.rs"',
    '"apps/desktop/core/src/crate_root.rs"',
    '"apps/desktop/core/src/content_sha256.rs"',
    '"apps/desktop/core/src/project_format.rs"',
    '"apps/desktop/core/src/score_attachment_recovery.rs"',
    '"apps/desktop/core/tests/content_sha256_shared_kernel.rs"',
    '"apps/desktop/core/tests/project_persistence*.rs"',
    '"apps/desktop/core/tests/project_format*.rs"',
    '"apps/desktop/core/tests/project_migration*.rs"',
    '"apps/desktop/core/testdata/project-*.json"',
    '"apps/desktop/src/App.tsx"',
    '"apps/desktop/src/App.project-save-source-authority.test.tsx"',
    '"apps/desktop/src/App.score-project-identity.test.tsx"',
    '"apps/desktop/src/features/workspace/SectionRoadmap.tsx"',
    '"apps/desktop/src/lib/analysis.ts"',
    '"apps/desktop/src/lib/analysis.workspace-single-flight.test.ts"',
    '"apps/desktop/src/lib/projectDocumentBridge.test.ts"',
    '"apps/desktop/src/lib/projectDocumentSaveAuthority.test.ts"',
    '"apps/desktop/src-tauri/Cargo.toml"',
    '"apps/desktop/src-tauri/Cargo.lock"',
    '"apps/desktop/src-tauri/src/main.rs"',
    '"apps/desktop/src-tauri/src/project_load.rs"',
    '"apps/desktop/src-tauri/src/project_persistence.rs"',
    '"apps/desktop/src-tauri/src/project_persistence_engine.rs"',
    '"apps/desktop/src-tauri/src/project_root.rs"',
    '"apps/desktop/src-tauri/tests/project_persistence*.rs"',
    '"apps/desktop/src-tauri/tests/project_persistence*.case"',
    '"docs/traceability/project-persistence-native-ci.md"',
    '"docs/traceability/project-persistence-score-publication-identity.md"',
    '"docs/traceability/project-persistence-score-recovery-reconciliation.md"',
    '"docs/traceability/project-persistence-shared-song-contract.md"',
    '"docs/traceability/project-persistence-workspace-mutation-admission.md"',
    '"services/analysis-engine/tests/test_project_persistence_workflow_policy.py"',
)


def _workflow_text(name: str) -> str:
    return (REPO_ROOT / ".github" / "workflows" / name).read_text(encoding="utf-8")


def _discovered_core_owner_targets() -> set[str]:
    targets = {path.stem for pattern in CORE_OWNER_TEST_PATTERNS for path in CORE_TEST_ROOT.glob(pattern)}
    targets.update((CORE_TEST_ROOT / name).stem for name in CORE_OWNER_EXACT_TESTS)
    return targets


def _executed_core_integration_targets(workflow: str) -> set[str]:
    return set(re.findall(r"(?:^|\s)--test\s+([A-Za-z0-9_-]+)", workflow))


def _assert_exact_core_integration_targets(
    workflow: str,
    lane: str,
    expected_targets: set[str] | None = None,
) -> None:
    expected = expected_targets if expected_targets is not None else _discovered_core_owner_targets()
    executed = _executed_core_integration_targets(workflow)
    assert executed == expected, (
        f"{lane} persistence workflow core owner drift: "
        f"missing={sorted(expected - executed)}, extra={sorted(executed - expected)}"
    )


def _assert_tracks_native_persistence_inputs(workflow: str, lane: str) -> None:
    for required_path in REQUIRED_NATIVE_PERSISTENCE_PATHS:
        assert required_path in workflow, f"{lane} persistence workflow misses {required_path}"


def _assert_enforces_owned_rust_warnings(workflow: str, lane: str) -> None:
    assert (
        f"--features {WARNING_GATE_FEATURE}" in workflow
    ), f"{lane} persistence workflow must compile owned Rust with the warning gate feature"


def _assert_runs_core_owner_contracts(workflow: str, lane: str) -> None:
    for command in CORE_OWNER_MODULE_COMMANDS:
        assert command in workflow, f"{lane} persistence workflow misses owner command: {command}"
    _assert_exact_core_integration_targets(workflow, lane)
    assert "--all-targets" not in workflow, (
        f"{lane} persistence workflow must not turn unrelated desktop-core domains into "
        "Project Persistence gate ownership"
    )


def _assert_checks_out_exact_source_identity(workflow: str, lane: str) -> None:
    assert (
        EXACT_SOURCE_REF in workflow
    ), f"{lane} persistence workflow must test the exact PR source head rather than GitHub's merge ref"


def test_owner_target_drift_guard_rejects_an_unexecuted_future_contract() -> None:
    """A newly discovered owner test must fail policy until the workflow executes it."""
    fixture_workflow = "run: cargo test --test project_persistence_contract"
    expected = {"project_persistence_contract", "project_persistence_future_contract"}

    try:
        _assert_exact_core_integration_targets(fixture_workflow, "hostile-fixture", expected)
    except AssertionError as error:
        assert "project_persistence_future_contract" in str(error)
    else:
        raise AssertionError("owner-target drift guard accepted an unexecuted future contract")


def test_windows_project_persistence_gate_tracks_contract_inputs() -> None:
    """Run the Windows regression whenever a persistence contract input changes."""
    workflow = _workflow_text(WINDOWS_WORKFLOW)

    _assert_tracks_native_persistence_inputs(workflow, "Windows")
    _assert_enforces_owned_rust_warnings(workflow, "Windows")
    _assert_runs_core_owner_contracts(workflow, "Windows")
    _assert_checks_out_exact_source_identity(workflow, "Windows")
    assert f'".github/workflows/{WINDOWS_WORKFLOW}"' in workflow
    assert not (REPO_ROOT / ".github" / "workflows" / LEGACY_WINDOWS_WORKFLOW).exists()
    assert "runs-on: windows-2025" in workflow
    assert TAURI_OWNER_TEST_COMMAND in workflow


def test_macos_project_persistence_gate_tracks_contract_inputs() -> None:
    """Run native macOS regressions for the same persistence owner inputs."""
    workflow = _workflow_text("project-persistence-macos.yml")

    _assert_tracks_native_persistence_inputs(workflow, "macOS")
    _assert_enforces_owned_rust_warnings(workflow, "macOS")
    _assert_runs_core_owner_contracts(workflow, "macOS")
    _assert_checks_out_exact_source_identity(workflow, "macOS")
    assert "runs-on: macos-15" in workflow
    assert TAURI_OWNER_TEST_COMMAND in workflow


def test_macos_and_windows_execute_the_same_core_owner_targets() -> None:
    """Platform-specific native lanes must not silently diverge in core owner coverage."""
    macos_targets = _executed_core_integration_targets(_workflow_text("project-persistence-macos.yml"))
    windows_targets = _executed_core_integration_targets(_workflow_text(WINDOWS_WORKFLOW))
    assert macos_targets == windows_targets == _discovered_core_owner_targets()


def test_native_warning_gate_is_owned_by_core_and_the_persistence_harness() -> None:
    """Deny owned warnings without global RUSTFLAGS, output filtering, or dependency lint changes."""
    core_manifest = (REPO_ROOT / "apps/desktop/core/Cargo.toml").read_text(encoding="utf-8")
    tauri_manifest = (REPO_ROOT / "apps/desktop/src-tauri/Cargo.toml").read_text(encoding="utf-8")
    core_root = (REPO_ROOT / "apps/desktop/core/src/root.rs").read_text(encoding="utf-8")
    harness = (REPO_ROOT / "apps/desktop/src-tauri/tests/project_persistence.rs").read_text(
        encoding="utf-8"
    )

    assert f"{WARNING_GATE_FEATURE} = []" in core_manifest
    assert (
        f'{WARNING_GATE_FEATURE} = ["bandscope-desktop-core/{WARNING_GATE_FEATURE}"]'
        in tauri_manifest
    )
    gate_attribute = f'cfg_attr(feature = "{WARNING_GATE_FEATURE}", deny(warnings))'
    assert gate_attribute in core_root
    assert gate_attribute in harness

    for workflow_name in (WINDOWS_WORKFLOW, "project-persistence-macos.yml"):
        workflow = _workflow_text(workflow_name)
        assert "RUSTFLAGS" not in workflow
        assert "grep" not in workflow.lower()
