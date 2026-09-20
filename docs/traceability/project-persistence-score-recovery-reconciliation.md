# Project Persistence score recovery reconciliation

## Problem

Score Storage can now produce a restart-safe inventory of validated published score ids, while the durable project document owns the score ids referenced by rehearsal metadata. Those two facts are intentionally different. After a crash between PDF publication and project metadata durability, a published id can exist without a project reference. The same byte state can also occur after metadata detach succeeded but byte cleanup failed.

Project Persistence therefore needs a path-free comparison contract before any recovery UI or mutation is allowed. Treating every unreferenced object as an interrupted attach would silently adopt data; treating every unreferenced object as garbage would erase buyer bytes.

Classification alone is also not deletion authority. `ScoreAttachmentRecoveryReconciliation` is public application data, so a later caller could otherwise feed a forged or stale classification into cleanup code. A destructive or reattachment path needs a second boundary that proves an explicit buyer decision applies to an identity that is still classified only as `unreferenced_published`.

## Constraints

- Score Storage remains the canonical owner of score object existence and native containment validation.
- Project Persistence remains the canonical owner of durable project references.
- Reconciliation accepts only opaque score ids. It does not accept filesystem paths, filenames, PDF bytes, timestamps, PIDs, or mutable sidecar state.
- Duplicate or malformed owner identities fail closed because they make lifecycle evidence ambiguous.
- Reconciliation must not auto-attach, auto-delete, retry, merge, or invent a lifecycle intent.
- A missing referenced score must never become cleanup or reattachment authority through this contract.
- An action authorization must revalidate public reconciliation state instead of trusting that the caller obtained it from `derive_score_attachment_recovery_candidates` unchanged.
- Restart inventory does not contain the original selected filename, so recovery presentation must not invent one.

## Decision

`derive_score_attachment_recovery_candidates` compares two validated identity sets and returns three deterministic, mutually exclusive sets:

- `referenced_and_published_score_ids`: durable project reference and Score Storage object both exist;
- `unreferenced_published_score_ids`: a published object exists without durable project reference;
- `missing_referenced_score_ids`: durable project metadata references an object absent from the supplied storage inventory.

The unreferenced set is deliberately named as evidence, not a disposition. It can represent either an interrupted attach that a buyer may want to recover or a detach whose storage cleanup failed. Application UX must obtain an explicit decision before adopting or discarding it.

`authorize_unreferenced_score_recovery_action` is the second boundary. It accepts only one current unreferenced-published id plus an explicit `Preserve`, `Recover`, or `Discard` decision. It revalidates all three public identity sets, rejects malformed or duplicated ids, rejects any cross-set overlap, and rejects referenced, missing-reference, and unknown ids. The returned `AuthorizedUnreferencedScoreRecoveryAction` has private fields so downstream code cannot manufacture cleanup or reattachment authority by struct literal.

This authorization still performs no I/O. `Preserve` is explicitly non-destructive. `Discard` is only cleanup-intent evidence for a future Score Storage call after the owner stack is integrated. `Recover` is only reattachment-intent evidence; Project Persistence still must commit attachment metadata durably before the recovered score can be presented as accepted.

Because Score Storage restart inventory intentionally returns score ids only, `recovery_attachment_metadata_for_action` does not pretend to recover the original selected filename. Only an authorized `Recover` action can produce `RecoveredScoreAttachmentMetadata`, and its deterministic display filename is `recovered-score-<score-id>.pdf`. `Preserve` and `Discard` actions fail closed at this boundary. The generated label is presentation truth, not source-file provenance.

## Alternatives rejected

- **Automatic attach of every unreferenced object:** cannot distinguish interrupted attach from failed cleanup after a completed detach.
- **Automatic deletion of every unreferenced object:** can destroy a PDF whose publication succeeded immediately before process death.
- **Trusting a public reconciliation struct as deletion or reattachment authority:** a caller can construct stale or overlapping sets; action must revalidate current classification invariants.
- **Pretending the original filename was recovered:** the inventory contract does not carry that evidence after the crash window.
- **Persisting user-local paths or mutable filename sidecars in Project Persistence:** crosses owner boundaries and adds recovery state whose durability would itself need reconciliation.
- **Filesystem scan inside Project Persistence:** duplicates Score Storage path and containment authority.
- **Path-returning reconciliation:** crosses the bounded-context trust boundary and exposes local storage topology without product need.
- **mtime/PID heuristics or mutable lifecycle sidecars:** time and process identity do not prove metadata durability or buyer intent.

## Security and privacy notes

Both inputs are treated as untrusted boundary data even when supplied by another BandScope owner. Every id must satisfy the canonical BandScope score-id shape and be unique within its owner set. Reconciliation failure returns `Could not reconcile score attachments.`; action-authorization failure returns `Could not authorize score attachment recovery action.`; presentation-metadata failure returns `Could not prepare recovered score attachment metadata.`. None of these errors includes paths, filenames, PDF bytes, project metadata, or the rejected id.

The service is pure and performs no I/O. It cannot weaken Score Storage's native symlink/reparse/containment checks and cannot mutate the project document. The action authorization never authorizes a `missing_referenced_score_ids` entry, so a broken durable reference cannot be silently converted into permission to delete or rewrite project truth. The generated recovery filename contains only a validated opaque score id and the fixed `recovered-score-` / `.pdf` literals; it does not expose the buyer's original selected filename or local path.

## Test points

Source-level RED `3484d5169b6e9b00501f4c6bf2f48e1165d6e144` added `project_persistence_score_recovery.rs` before the production reconciliation symbol existed. The contract requires classification of matched, unreferenced-published, and missing-referenced ids; deterministic ordering; and fail-closed duplicate/malformed identities.

Causal implementation `67febe0a049e642f5ced0c8cfb355d8b1108e25b` added the pure reconciliation service. `95aee6d464f1bbdc026cd4ab20ff5739ab6c116d` exported the contract from the canonical desktop-core root.

Self-review after CI ownership wiring found that the initial error assertions called `Result<ScoreAttachmentRecoveryReconciliation, String>::as_deref()`, which is not available because the success type does not implement `Deref`. `e8f8da6ef3839e66182c3f2adca0da50f3c93d10` repairs the integration assertion and `75e5efe1be2c4f4b818d191b2ed8d79a04a38d2b` repairs the module regression by applying `err().as_deref()` to `Option<String>`. This is test-harness RCA, not a change to the reconciliation contract.

A second source-level RED, `25a3e6c93db2464de90063910ae0de58aa8e7f05`, requires explicit preserve/discard authorization for an unreferenced published id and proves that referenced, missing-reference, unknown, malformed, and forged cross-set identities cannot become cleanup authority. No hosted RED is claimed because the causal repair followed before a terminal workflow verdict.

`93a2e9ce313db949eda2fa5ee4535feb3c26af78` adds the authorization contract and opaque proof type; `9147521985c4bd8fe924c827776465d592fa1bdc` exports it from the canonical desktop-core root. `59f4c153b20aaab2d23dbe1aaad4a43ff378be60` is a no-semantics-change cleanup of the set-overlap checks before hosted settlement.

The first exact-head macOS owner run after that repair succeeded, but self-review found an evidence-ownership defect before treating it as contract GREEN: both native workflows tracked `apps/desktop/core/tests/project_persistence*.rs` yet executed only the `apps/desktop/src-tauri` integration manifest. Cargo does not execute a dependency crate's integration tests merely because the dependency compiles, so the new `project_persistence_score_recovery.rs` assertions were not owned by those native jobs. Source-level CI RED `6611511e1a5f0c135b4f91075c0e5fd774d27a23` updates the workflow-policy regression to require the desktop-core owner suite explicitly. `7ef92d833052ab5476aab37c4f38f70ce136d00f` repairs macOS and `24bc2355ac2a9b2c6ee5c6f074d029e1ffc70516` repairs Windows by adding desktop-core execution before the existing native Tauri suite. No predecessor native success is transferred to the repaired workflows.

That stronger evidence lane exposed a real owned-test compile defect on both platforms. Exact `c4efdda17f6d788d3d8bfdf1687d5e2ace5c830d`, macOS run `35498669102`/job `106046318294` and Windows run `35498668971`/job `106046317550`, both fail in `content_sha256_shared_kernel.rs`: the assertion compares `Result<&str, &std::io::Error>` with `assert_eq!`, but `std::io::Error` does not implement `PartialEq`. This is not a runner or provider failure. `217642d8b44eede92d1745878d62da2a7c81c2fb` fixes the regression by requiring the in-memory read to succeed and then comparing only the digest String. `b818b028a7b23ce1f0c666d824f61676538e7254`, `313c3247904993980d31b09736590e421879ac8d`, and `b55373a84a32e8fe893ae4d50b4d28fc8c482fb4` add the shared content-identity source/test to the policy and both native trigger contracts so future changes cannot bypass Project Persistence owner evidence.

The initial core command was still too broad: `--all-targets` made the Project Persistence lane execute unrelated Resource Admission/YouTube unit tests. Exact `4f79c0a8715a66de69c75ad7691e3b9a9e5a0651` Windows run `35498831001`/job `106046769147` compiled the repaired shared-kernel test and passed the score-recovery unit tests, then failed only `runtime_core::tests::youtube_process_output_drains_large_stdout_and_stderr_before_exit`. RCA showed the child re-entry uses `--exact tests::youtube_process_output_drains_large_stdout_and_stderr_before_exit` while the current crate-root name is `runtime_core::tests::youtube_process_output_drains_large_stdout_and_stderr_before_exit`, so the child runs no matching test and the parent sees less than the intended 1 MiB output. This discovered defect belongs to the process-helper/Resource Admission lane and is tracked as #1244; no platform skip or reduced assertion is accepted as its fix.

Project Persistence does not absorb that owner. `28a287ae4a824413fe0edb69cdc3974c2e4c2999` changes the workflow-policy regression from `--all-targets` to explicit Project Persistence/shared-content-identity module and integration targets. `ac9defa765d6c3eaae0dbe12d01d3fa141ececd0` and `d72c25353746fb1b68cf7bc5ee42742a80da7ecd` apply the same semantic boundary to macOS and Windows. Production library code is still compiled with `persistence_warning_gate`; the lane runs recovery and content-identity module tests plus all Project Persistence/project-format integration targets before the native Tauri suite. This is owner isolation, not suppression of #1244.

A third source-level RED, `e1ff85e77c08b030bc54995b8213c47cc634a5ab`, requires an explicit `Recover` decision and rejects treating preserve/discard intent as reattachment metadata. It also requires the recovered attachment to use the deterministic generated filename `recovered-score-<score-id>.pdf` and never claim an absent original filename. No hosted RED is claimed because causal descendants followed before a terminal workflow verdict.

`184690416054be6aba415e574f94965f3e89338c` adds the `Recover` decision, opaque `RecoveredScoreAttachmentMetadata`, and `recovery_attachment_metadata_for_action`. `6a77bec1353ced292337e034435111da6a3f6289` exports the new contract from the canonical desktop-core root. The owner module and integration regression cover both the recover-success path and preserve/discard rejection paths.

Exact-head hosted evidence must be taken only from the final unchanged head.

## Remaining integration

This contract still does not consume the Score Storage inventory from PR #1241 because that owner is not protected/released on the Project Persistence branch. After the owner contract is integrated, the application can supply durable project attachment ids and validated Score Storage inventory ids to this service, surface `unreferenced_published_score_ids` as explicit recovery candidates, and treat `missing_referenced_score_ids` as a broken-reference condition without silently rewriting either owner.

The filename-truth gap is now bounded in the domain: an authorized `Recover` action can produce durable attachment metadata without fabricating the original filename. What remains is application orchestration and buyer interaction. The application must present the candidate, obtain explicit Recover / Preserve / Discard intent, persist recovered metadata through the Project Persistence CAS/durability path, and only then present it as an accepted attachment. A discard path must cross the separate Score Storage owner boundary with current authorization; it must not be inferred from reconciliation alone.

Buyer-visible wording, keyboard and screen-reader interaction, crash-window E2E, locale coverage, missing-reference UI, cross-owner protected/released integration, and packaged recovery evidence remain separate acceptance work.
