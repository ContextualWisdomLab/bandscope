# Project Persistence native CI coverage

## Problem

Project Persistence has platform-specific native behavior that ordinary Linux or compile-only evidence cannot substitute for. Windows uses `ReplaceFileW` and reparse-point handling; macOS uses `renamex_np`/`RENAME_SWAP`, no-follow file opens, and trusted root-directory alias handling. The original dedicated Windows Project Persistence workflow did not track `project_load.rs` or `project_root.rs`, and there was no equivalent macOS integration-test lane. `build-baseline` compiles/packages the native shell but does not execute the `src-tauri` integration-test suite that exercises migration publication, recovery, root aliases, path authority, and platform-specific rollback behavior.

The first trigger repair was still insufficient as exact-head evidence. Exact descendant `ddfad475bc11f850c0a02598563a4a3fdfdc5527` produced a successful macOS Project Persistence run, but no exact-head Windows owner run was present. After both workflows were made to track this traceability document, exact `60e062354d8e74fc3762d70e7b1d8323abad7d07` again materialized the macOS owner workflow but still did not materialize the Windows owner workflow. This is observable workflow-registration behavior; it does not prove why GitHub retained that behavior, so the repair does not label the old workflow as disabled.

Because this project requires evidence to belong to the exact source head rather than a predecessor, a workflow identity that repeatedly fails to materialize cannot remain the canonical Windows evidence owner.

After the successor workflow did materialize, hosted Windows evidence exposed a second, independent defect in the integration fixture. Run `35389890487`, job `105745527622`, reached the actual Tauri test suite and failed only `synced_source_publication_moves_the_owned_stage_only_after_durable_no_replace_publish`. The fixture wrote a staged source and then reopened it with `fs::File::open`, which is a read-only handle. Calling `sync_all` on that handle succeeds on the Unix lane but Windows returned `ERROR_ACCESS_DENIED` (OS error 5), because durable file-buffer flushing requires write authority on the Windows handle. This was a test portability defect in the durability precondition, not evidence that the publication primitive itself rejected a valid staged file.

The later migration-recovery journal upgrade exposed a third hosted defect rather than being accepted on source inspection alone. Exact `b1edaf362d837002b833201fadca2a3cf29c4775`, macOS run `35400310428`, job `105778460931`, compiled the real integration suite and failed with Rust `E0061`: `project_persistence_rollback_identity.rs` still called `create_publication_journal` with the old five-argument helper contract after the production journal gained explicit `PublicationValidation`. This was a stale test adapter caused by the owner API evolution. It was repaired directly in the canonical #970 lane rather than skipped or hidden.

The same native log also showed warning debt: the compatibility `runtime_core` still exports an obsolete v1 project serializer alongside the canonical v3 `project_format` owner, and per-test source inclusion makes unrelated Project Persistence symbols appear unused. These warnings are tracked as root-cause work in #1235; this lane does not suppress them with `allow`, `RUSTFLAGS`, output filtering, or test exclusion.

## Decision

Project Persistence treats Windows and macOS native test lanes as owner evidence, not as optional packaging smoke tests.

Both workflows track the direct Project Persistence inputs, including `project_load.rs`, `project_persistence.rs`, `project_root.rs`, the Tauri entry point, project-format/core contracts, persistence tests/fixtures, the workflow-policy regression, and this native-CI traceability document. Updating the evidence contract therefore refreshes both platform lanes on the resulting exact head.

The Windows lane now uses the successor file identity `.github/workflows/project-persistence-windows-native.yml`. Its job/check contract remains `test / project-persistence / windows`, `windows-2025`, Rust 1.97.1, and `cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --no-default-features --tests`. The previous `.github/workflows/project-persistence-windows.yml` file is removed so there is one Windows Project Persistence source owner rather than duplicate workflow writers.

The macOS lane remains `.github/workflows/project-persistence-macos.yml` on `macos-15` with the same Rust/tool/test boundary. Both workflows remain read-only (`contents: read`) and use the repository-pinned checkout SHA with persisted credentials disabled. They do not add signing, notarization, secrets, deployment, or release authority.

The staged-source durability fixture now reopens the stage with explicit read/write authority before `sync_all`. This matches the authority required for a durable flush on Windows while preserving the same buyer contract: bytes must be durably flushed before the no-replace publication owner is invoked. The repair does not weaken or skip the durability assertion and does not change production publication semantics.

The rollback-identity test adapter now calls the versioned journal owner with `PublicationValidation::IdentityOnly`, matching the ordinary-save behavior that test exists to exercise. It does not fabricate a migration receipt or weaken the new migration-specific recovery contract. Exact descendant `d8edb4a9f6eb422eb7561a763c9692a499dee492` subsequently completed both dedicated Windows and macOS Project Persistence lanes successfully; later heads must reacquire their own verdicts.

## RED / GREEN evidence

Initial native-lane repair:

- RED `4008dab7a5aa9092c37559fcc17632dfee8d7e57` extends `test_project_persistence_workflow_policy.py` so the owner gate requires `project_load.rs` and `project_root.rs`, and requires a macOS persistence workflow using `macos-15` plus the pinned Tauri integration-test command.
- GREEN `cc80424c4e048cbbc0337eae530c572d083a5200` repairs the original Windows workflow path contract.
- GREEN `e0566c363604c2a29a17c09105123d220e57effc` adds the native macOS Project Persistence lane.
- TRACEABILITY `ddfad475bc11f850c0a02598563a4a3fdfdc5527` produced an exact-head macOS native test success, but no exact-head Windows owner run was present, so that state was not accepted as symmetric platform evidence.

Exact-head refresh repair:

- RED `1726e9bfa1455dd3b9cb6afb93b18aede2befcd7` requires both native workflows to track this traceability document and the policy regression itself.
- GREEN `488b89d56b3dc8d2e9d34ac72dd69bb065e0350a` adds the traceability path to Windows pull-request/protected-branch triggers.
- GREEN `ad9087ac83e8e513e7a665c7d6bc6757d27d79b6` adds the same trigger contract to macOS.
- TRACEABILITY `60e062354d8e74fc3762d70e7b1d8323abad7d07` again materialized macOS but not the Windows owner workflow, demonstrating that path coverage alone did not restore exact-head Windows evidence.

Windows workflow-identity successor repair:

- RED `488b2decf961d2ce28c8fdefe48d456cfdbe2f27` changes the policy regression to require the canonical successor filename and the absence of the legacy Windows workflow file. The predecessor still had only the legacy file, so the regression is intentionally non-green there.
- GREEN `c6045d8d743f4d0b997f706fc1b35c27a666b16b` creates `project-persistence-windows-native.yml` with the same platform, permissions, pinned checkout, Rust version, owner-input triggers, and integration-test command.
- GREEN `61f7d5654f9618e098ba6c031980d4cdc48a2c06` removes the old Windows workflow file so the successor is the sole Windows Project Persistence workflow owner.
- TRACEABILITY `05ed6c1b10d89d470281edaae2a7c3c68785ad68` is the first exact head where both native owner workflows materialized. macOS completed successfully; Windows reached the suite and produced the hosted RED below.

Windows durable-flush portability repair:

- HOSTED RED `05ed6c1b10d89d470281edaae2a7c3c68785ad68`, run `35389890487`, job `105745527622`: 20/21 `project_persistence_atomic_publication` tests passed; `synced_source_publication_moves_the_owned_stage_only_after_durable_no_replace_publish` failed at the fixture's pre-publication `sync_all` with Windows OS error 5 (`Access is denied`).
- GREEN SOURCE `62ac8f8e46acb26fc542c4e995cc530ebc295090` changes only that fixture's reopen authority from read-only `File::open` to `OpenOptions` with read/write access before `sync_all`. No production publication code, gate, or assertion is weakened.
- Exact descendant `fddd9965043c9b67a5542d6db45f79661a032734` completed both dedicated native owner lanes successfully before the next semantic recovery change.

Recovery-journal API integration repair:

- HOSTED RED `b1edaf362d837002b833201fadca2a3cf29c4775`, macOS run `35400310428`, job `105778460931`: the integration build failed with `E0061` in `project_persistence_rollback_identity.rs` because its test wrapper still called `create_publication_journal` without the new `PublicationValidation` argument.
- GREEN SOURCE `d8edb4a9f6eb422eb7561a763c9692a499dee492` updates only the stale test wrapper to pass `PublicationValidation::IdentityOnly`, preserving the rollback-identity test's ordinary-save semantics.
- Exact `d8edb4a9f6eb422eb7561a763c9692a499dee492` completed `test / project-persistence / macos` and `test / project-persistence / windows` successfully. General CI/security/SBOM/SAST/build checks and independent review remain separate gates.
- Warning debt observed in the same hosted lane is tracked by #1235 and is not treated as acceptable native-output noise.

Hosted success must be read from the exact descendant head containing the complete lineage. Source configuration or a predecessor run alone is not terminal GREEN.

## Rejected alternatives

Relying on `build-baseline` alone was rejected because a successful native application build does not execute the Project Persistence integration tests or prove platform-specific rollback behavior.

Treating an earlier platform run as evidence for a later head was rejected because the repository's release and review policy is exact-head based. No-op commits solely to retrigger Actions were also rejected; each commit in this repair changes a test, trigger contract, workflow identity, or traceability contract.

Keeping both Windows workflow files was rejected because it would create duplicate source owners and could produce ambiguous or duplicate check evidence.

Describing the old workflow as disabled was rejected because the available repository evidence proves repeated non-materialization, not the underlying GitHub Actions workflow-state cause. The successor identity repairs the observable registration/evidence failure without inventing a backend diagnosis.

Combining Windows and macOS into one matrix workflow was deferred because that would unnecessarily change the already-working macOS workflow identity and diagnostics while the defect is isolated to Windows workflow materialization.

Skipping or `cfg`-excluding the failing durability test on Windows was rejected because Windows is exactly the platform where the handle-authority distinction matters. Replacing the flush with a no-op or accepting OS error 5 would turn a real durability precondition into false-positive evidence. The fixture instead acquires the authority required to perform the same flush contract.

Leaving the rollback helper on its old signature through a test-only overload or default parameter was rejected. The test adapter is part of the executable owner contract and must state whether it is exercising ordinary identity-only publication or receipt-bound migration. `IdentityOnly` is explicit because this regression tests rollback artifact identity, not migration evidence.

Suppressing the Rust warnings was rejected. #1235 owns root-cause removal of the obsolete compatibility serializer/version surface and the per-test source-inclusion warning pattern; native lanes stay diagnostic rather than being made artificially quiet.

## Claim boundary

These workflows provide native integration-test execution on hosted Windows and macOS runners. The Windows fixture repair proves only that the durability precondition is expressed with cross-platform-correct handle authority, and the recovery-helper repair proves that the executable test adapter matches the versioned journal contract. Every semantic descendant must obtain its own terminal native evidence.

The lanes are not packaged power-loss, disk-full, permission-failure, signing/notarization, or updater-rollback evidence. Those buyer-facing fault-injection and release gates remain open under #962. Warning-free native output is also not yet claimed; #1235 remains open until the duplicate compatibility surface and test-module warning architecture are repaired without suppression.
