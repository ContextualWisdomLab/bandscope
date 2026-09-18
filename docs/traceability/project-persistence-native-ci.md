# Project Persistence native CI coverage

## Problem

Project Persistence has platform-specific native behavior that ordinary Linux or compile-only evidence cannot substitute for. Windows uses `ReplaceFileW` and reparse-point handling; macOS uses `renamex_np`/`RENAME_SWAP`, no-follow file opens, and trusted root-directory alias handling. The repository already had a dedicated Windows Project Persistence workflow, but its path filters did not include `project_load.rs` or `project_root.rs`. A change to the migrate-on-load application service or project-root authority could therefore miss the owner-specific Windows regression lane.

There was also no equivalent macOS Project Persistence test workflow. `build-baseline` proves that the native shell can compile/package on macOS, but it does not execute the `src-tauri` integration-test suite that exercises migration publication, recovery, root aliases, path authority, and platform-specific rollback behavior.

A second evidence gap appeared after the initial repair. Exact descendant `ddfad475bc11f850c0a02598563a4a3fdfdc5527` produced a successful macOS Project Persistence run, but no exact-head Windows owner run was present. The head had moved through the CI traceability commit after the Windows workflow edit. Because this project requires evidence to belong to the exact source head rather than a predecessor, changing the native-evidence contract itself must refresh both platform lanes.

## Decision

Project Persistence treats the Windows and macOS native test lanes as owner evidence, not as optional packaging smoke tests.

Both workflows track the direct Project Persistence inputs, including `project_load.rs`, `project_persistence.rs`, `project_root.rs`, the Tauri entry point, project-format/core contracts, persistence tests/fixtures, the workflow-policy regression, and this native-CI traceability document. Updating the evidence contract therefore causes both platform lanes to execute on the resulting exact head.

A separate `project-persistence-macos.yml` workflow runs the same Tauri integration-test command on `macos-15` with Rust 1.97.1 and the same compile-only frontend fixture boundary used by the Windows lane. Keeping the workflows separate preserves platform-specific check names and diagnostics while avoiding a rename of the established Windows workflow.

Both workflows remain read-only (`contents: read`) and use the repository-pinned checkout SHA with persisted credentials disabled. They do not add signing, notarization, secrets, deployment, or release authority.

## RED / GREEN evidence

Initial native-lane repair:

- RED `4008dab7a5aa9092c37559fcc17632dfee8d7e57` extends `test_project_persistence_workflow_policy.py` so the owner gate requires `project_load.rs` and `project_root.rs`, and requires a macOS persistence workflow using `macos-15` plus the pinned Tauri integration-test command. The predecessor lacked those requirements and had no macOS workflow.
- GREEN `cc80424c4e048cbbc0337eae530c572d083a5200` repairs the Windows workflow path contract so changes to the migrate-on-load and project-root owners cannot silently bypass the Windows lane.
- GREEN `e0566c363604c2a29a17c09105123d220e57effc` adds the native macOS Project Persistence lane with the same owner-input trigger contract and integration-test command.
- TRACEABILITY `ddfad475bc11f850c0a02598563a4a3fdfdc5527` records the decision and subsequently produced an exact-head macOS native test success. No exact-head Windows owner run was present on that descendant, so that state was not accepted as symmetric platform evidence.

Exact-head evidence-refresh repair:

- RED `1726e9bfa1455dd3b9cb6afb93b18aede2befcd7` requires both native workflows to track this traceability document and the policy regression itself. The predecessor workflows tracked the policy regression but not the traceability document.
- GREEN `488b89d56b3dc8d2e9d34ac72dd69bb065e0350a` adds the traceability path to both pull-request and protected-branch triggers for the Windows lane.
- GREEN `ad9087ac83e8e513e7a665c7d6bc6757d27d79b6` adds the same trigger contract to the macOS lane.

Hosted success must be read from the exact descendant head containing the complete lineage. Source configuration alone is not terminal GREEN.

## Rejected alternatives

Relying on `build-baseline` alone was rejected because a successful native application build does not execute the Project Persistence integration tests or prove platform-specific rollback behavior.

Adding only `project_load.rs` to the Windows filter was rejected because `project_root.rs` owns reopen/path authority and has platform-specific integration tests in the same bounded context.

Treating an earlier platform run as evidence for a later traceability head was rejected because the repository's release and review policy is exact-head based. No-op commits solely to retrigger Actions were also rejected; the fix instead makes the evidence contract itself an explicit workflow input.

Renaming the existing Windows workflow into a matrix workflow was rejected for this slice because it would change an established check identity while solving a narrower evidence gap. Separate workflows make platform failures attributable without weakening or replacing the current Windows check.

## Claim boundary

These workflows provide native integration-test execution on hosted Windows and macOS runners. They are not packaged power-loss, disk-full, permission-failure, signing/notarization, or updater-rollback evidence. Those buyer-facing fault-injection and release gates remain open under #962.
