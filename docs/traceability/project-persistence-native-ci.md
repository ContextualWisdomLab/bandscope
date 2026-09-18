# Project Persistence native CI coverage

## Problem

Project Persistence has platform-specific behavior that Linux-only or compile/package smoke evidence cannot substitute for. Windows uses `ReplaceFileW`, native volume/file-index identity, and reparse-point boundaries. macOS uses `renamex_np`/`RENAME_SWAP`, no-follow file opens, and trusted root-alias handling. `build-baseline` can prove that the native shell compiles and packages, but it does not execute the Tauri integration regressions for migration publication, rollback, recovery journals, path authority, or exact native identity.

The first native-CI repair found two evidence defects. The original Windows workflow did not track every direct persistence owner input and there was no symmetric macOS integration lane. After the trigger contract was repaired, macOS materialized but the old Windows workflow repeatedly did not. Repository evidence established the non-materialization, not its GitHub backend cause, so the workflow was replaced by a single canonical successor rather than being described as “disabled.”

Once Windows actually ran, it exposed a fixture portability defect: run `35389890487`, job `105745527622` reached the real Tauri suite and failed only `synced_source_publication_moves_the_owned_stage_only_after_durable_no_replace_publish`. The test had reopened a staged file read-only before `sync_all`; Windows correctly returned `ERROR_ACCESS_DENIED` because durable file-buffer flushing requires write authority on that handle. The fixture was repaired without skipping Windows or weakening the durability assertion.

A later migration-recovery change exposed a second hosted integration defect. Exact `b1edaf362d837002b833201fadca2a3cf29c4775`, macOS run `35400310428`, job `105778460931`, failed with Rust `E0061` because a rollback regression still used the pre-`PublicationValidation` test adapter. That adapter was repaired to exercise explicit `IdentityOnly` semantics rather than inventing migration evidence.

Native logs then exposed warning debt under #1235. The first root cause was semantic: compatibility `runtime_core` still carried a v1 project serializer and a public `CURRENT_PROJECT_FORMAT_VERSION = 1` surface after canonical current writing had moved to v3 `project_format`. The second root cause was test architecture: thirteen Project Persistence integration targets each `#[path]`-compiled or `include!`-compiled the complete private `project_persistence.rs`, and some separately compiled `project_load.rs` or `project_root.rs`. That multiplied unrelated `dead_code` diagnostics and re-ran the embedded `#[cfg(test)]` persistence tests in each integration crate.

## Decision

Windows and macOS Project Persistence workflows are owner evidence, not optional packaging smoke tests. They remain read-only (`contents: read`), use the repository-pinned checkout SHA, Rust 1.97.1, and execute:

`cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --no-default-features --tests`

The Windows owner is `.github/workflows/project-persistence-windows-native.yml`; the legacy Windows workflow file is absent. The macOS owner is `.github/workflows/project-persistence-macos.yml`. Both workflows track the direct persistence source, core project-format contracts and fixtures, native test inputs, workflow-policy regression, and this traceability document.

The warning-debt repair keeps canonical ownership narrow. `runtime_core` parses strict historical/v1 input only; `project_format` owns current v3 parsing, migration normalization, and serialization. No deprecated duplicate writer, fake reference, lint allowlist, `RUSTFLAGS` filter, log filter, test skip, or gate reduction is used.

For native integration tests, the production persistence owner is now included once in `apps/desktop/src-tauri/tests/project_persistence.rs`. Case bodies live in `project_persistence_*.case` modules so Cargo does not auto-discover each as a separate integration crate. `project_load.rs` and `project_root.rs` are likewise included once where those cases need the private application boundary. The rollback regression’s access to private journal helpers remains a test-only adapter inside the same included persistence module; production visibility is not widened.

The workflows and `test_project_persistence_workflow_policy.py` track both `project_persistence*.rs` and `project_persistence*.case`, so changing a case cannot silently bypass exact-head native evidence.

This single-harness change intentionally does not pretend that an integration crate and the production binary are one compilation unit. Hosted logs on exact `92136baa8538a68a527be863ec3c9606256f77ac` proved that the previous per-case multiplication is gone: macOS executed one consolidated `tests/project_persistence.rs` target containing 57 Project Persistence cases. The same log also identified two residual warnings rather than hiding them:

- `publish_synced_file_noreplace` was unused only in the consolidated integration harness even though it is a production owner surface.
- `read_project_file` was unused in the production binary because migrate-on-load now uses `read_project_file_with_identity`; the String-only compatibility projection remains test-only in practice but is still compiled as production code.

The first residual warning is addressed by `2b0d5d9670b7b6906d469ba96b12d0a7386a77b0`, which adds a real integration regression through the production `publish_synced_file_noreplace` wrapper. The test durably flushes a staged source, invokes the actual wrapper, then verifies exact target bytes and stage-name retirement. This is behavioral coverage, not an artificial symbol reference. The `read_project_file` production-warning root remains open under #1235 and must be removed or scoped honestly to test-only compatibility without suppressing diagnostics.

## RED / GREEN evidence

### Native lane registration and portability

- RED `4008dab7a5aa9092c37559fcc17632dfee8d7e57`: policy regression requires `project_load.rs`, `project_root.rs`, and a macOS owner lane.
- GREEN `cc80424c4e048cbbc0337eae530c572d083a5200`: repairs the original Windows path contract.
- GREEN `e0566c363604c2a29a17c09105123d220e57effc`: adds the macOS native lane.
- RED `1726e9bfa1455dd3b9cb6afb93b18aede2befcd7`: both workflows must track traceability/policy inputs.
- GREEN `488b89d56b3dc8d2e9d34ac72dd69bb065e0350a` and `ad9087ac83e8e513e7a665c7d6bc6757d27d79b6`: exact-head trigger refresh contract.
- RED `488b2decf961d2ce28c8fdefe48d456cfdbe2f27`: policy requires the Windows successor identity and absence of the legacy file.
- GREEN `c6045d8d743f4d0b997f706fc1b35c27a666b16b` + `61f7d5654f9618e098ba6c031980d4cdc48a2c06`: creates the successor and removes the duplicate Windows owner.
- HOSTED RED `05ed6c1b10d89d470281edaae2a7c3c68785ad68`, run `35389890487`, job `105745527622`: Windows reaches the suite; 20/21 atomic-publication tests pass and the read-only `sync_all` fixture fails with OS error 5.
- GREEN SOURCE `62ac8f8e46acb26fc542c4e995cc530ebc295090`: stage is reopened read/write before the same durability flush. Exact descendant `fddd9965043c9b67a5542d6db45f79661a032734` subsequently passes both native lanes.

### Recovery-journal adapter

- HOSTED RED `b1edaf362d837002b833201fadca2a3cf29c4775`, macOS run `35400310428`, job `105778460931`: stale rollback adapter fails Rust `E0061` after `PublicationValidation` becomes explicit.
- GREEN SOURCE `d8edb4a9f6eb422eb7561a763c9692a499dee492`: adapter explicitly uses `PublicationValidation::IdentityOnly`; that exact head passes both native lanes.

### #1235 current-format writer ownership

- FINDING: native warning output showed that v1 compatibility code still exposed a second project writer and a misleading public “current version = 1” surface.
- GREEN SOURCE `5c1a26e0ce8945614ea740320492936fff0365eb`: removes the obsolete v1 serializer, replaces the public current-version surface with private `LEGACY_PROJECT_FORMAT_VERSION`, and retains strict historical parsing only.
- GREEN HYGIENE `6156d35a5665d19bde7424e2f6cc4f7021aeb963`: consumes the deserialized v1 version field and removes incidental declaration-order churn.
- TRACEABILITY `7f55bfc8ce049bc08525257a7a69ed59a97e2627`: records the single-writer decision and leaves the per-test compilation architecture explicitly open.

### #1235 single-compile integration harness

- FINDING at `7f55bfc8ce049bc08525257a7a69ed59a97e2627`: thirteen native Project Persistence integration targets independently compiled the complete private persistence source, multiplying unrelated `dead_code` diagnostics and embedded unit-test execution.
- GREEN SOURCE `69d54d40191fca3e39fbd540d4a2a165675c1eaa`: consolidates the integration cases under one `tests/project_persistence.rs` harness; former auto-discovered `.rs` case files become `.case` modules; private rollback helpers stay test-only inside the included owner module.
- GREEN CI CONTRACT `582ec084cf56838d1d2a06048cef716b03ee2796`: Windows/macOS workflows and policy regression track the new `.case` inputs.
- HOSTED RED `582ec084...`, macOS native job `105791463150`: the real consolidated harness fails with `E0432` because the nested rollback case imported `super::project_persistence`; after consolidation its immediate parent is the case module, not the integration crate.
- GREEN SOURCE `92136baa8538a68a527be863ec3c9606256f77ac`: changes only that case import to `crate::project_persistence`.
- HOSTED GREEN for structural repair: exact `92136baa...` macOS run `35404731489` and Windows run `35404731472` both complete successfully. macOS runs a single consolidated `tests/project_persistence.rs` target with 57 passing Project Persistence cases, while its log still reports the two residual warnings described above. This proves test consolidation, not warning-free production.
- GREEN COVERAGE `2b0d5d9670b7b6906d469ba96b12d0a7386a77b0`: exercises the real `publish_synced_file_noreplace` production wrapper through a durably flushed stage and native no-replace publication, addressing the harness-only unused-symbol diagnostic without a fake reference.

Every semantic descendant must reacquire its own hosted verdict. A successful predecessor is lineage evidence only.

## Rejected alternatives

`build-baseline` alone is insufficient because it does not execute platform-specific persistence/recovery tests.

Predecessor check results are not transferred to a later source head. No-op commits used only to retrigger Actions are also rejected; every commit here changes a test, trigger, workflow identity, ownership boundary, or traceability contract.

Keeping both Windows workflow files is rejected because it creates duplicate evidence owners. Describing the old workflow as disabled is rejected because the available evidence proves only repeated non-materialization, not the backend cause.

A Windows `cfg` skip, accepting OS error 5, or removing `sync_all` is rejected because it would erase the durability condition that the platform-specific lane exists to test.

A deprecated v1 writer, test-only duplicate writer, fake call, `#[allow(dead_code)]`, broad warning suppression, or output filtering is rejected. Current-format serialization has one owner and warning debt is repaired at its cause.

Making private Project Persistence capabilities broadly `pub` for integration tests is rejected. The consolidated harness preserves the crate-private production boundary and supplies only narrow test adapters inside its private included module.

Generating copied test source with a build script/codemod is rejected because it creates a self-modifying/source-copy workflow and another mutable representation of the owner.

The consolidated harness is not treated as permission to leave genuine production dead code. The remaining `read_project_file` warning represents a compatibility surface that no production path consumes after identity-bound migrate-on-load. It stays an explicit #1235 repair finding until the source boundary is narrowed or removed with its tests migrated to the identity-bearing reader.

## Claim boundary

Dedicated native Windows/macOS success proves only that the relevant integration suite compiles and passes on those hosted platforms for the exact head tested. It does not prove packaged process-kill, disk-full, permission-failure, power-loss, signing/notarization, updater rollback, or release immutability.

The single-harness repair proves that Project Persistence integration cases no longer each compile their own copy of the production persistence source. It does **not** yet prove warning-free native output: exact `92136baa...` still reports the genuine production `read_project_file` dead-code finding, and the new `2b0d5d...` coverage change must obtain its own exact-head native verdict.

General CI, security/SAST, SBOM, build-baseline, protected ancestry, Resource Admission #866 integration, and independent current-head review remain separate gates. No Ready transition, merge, tag, signing, or release is authorized solely by this document or by a predecessor native run.
