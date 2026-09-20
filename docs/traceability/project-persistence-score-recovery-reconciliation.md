# Project Persistence score recovery reconciliation

## Problem

Score Storage can now produce a restart-safe inventory of validated published score ids, while the durable project document owns the score ids referenced by rehearsal metadata. Those two facts are intentionally different. After a crash between PDF publication and project metadata durability, a published id can exist without a project reference. The same byte state can also occur after metadata detach succeeded but byte cleanup failed.

Project Persistence therefore needs a path-free comparison contract before any recovery UI or mutation is allowed. Treating every unreferenced object as an interrupted attach would silently adopt data; treating every unreferenced object as garbage would erase buyer bytes.

Classification alone is also not deletion authority. `ScoreAttachmentRecoveryReconciliation` is public application data, so a later caller could otherwise feed a forged or stale classification into cleanup code. A destructive path needs a second boundary that proves an explicit buyer decision applies to an identity that is still classified only as `unreferenced_published`.

## Constraints

- Score Storage remains the canonical owner of score object existence and native containment validation.
- Project Persistence remains the canonical owner of durable project references.
- Reconciliation accepts only opaque score ids. It does not accept filesystem paths, filenames, PDF bytes, timestamps, PIDs, or mutable sidecar state.
- Duplicate or malformed owner identities fail closed because they make lifecycle evidence ambiguous.
- Reconciliation must not auto-attach, auto-delete, retry, merge, or invent a lifecycle intent.
- A missing referenced score must never become cleanup authority through this contract.
- An action authorization must revalidate public reconciliation state instead of trusting that the caller obtained it from `derive_score_attachment_recovery_candidates` unchanged.

## Decision

`derive_score_attachment_recovery_candidates` compares two validated identity sets and returns three deterministic, mutually exclusive sets:

- `referenced_and_published_score_ids`: durable project reference and Score Storage object both exist;
- `unreferenced_published_score_ids`: a published object exists without durable project reference;
- `missing_referenced_score_ids`: durable project metadata references an object absent from the supplied storage inventory.

The unreferenced set is deliberately named as evidence, not a disposition. It can represent either an interrupted attach that a buyer may want to recover or a detach whose storage cleanup failed. Application UX must obtain an explicit decision before adopting or discarding it.

`authorize_unreferenced_score_recovery_action` is the second boundary. It accepts only one current unreferenced-published id plus an explicit `Preserve` or `Discard` decision. It revalidates all three public identity sets, rejects malformed or duplicated ids, rejects any cross-set overlap, and rejects referenced, missing-reference, and unknown ids. The returned `AuthorizedUnreferencedScoreRecoveryAction` has private fields so downstream code cannot manufacture cleanup authority by struct literal.

This authorization still performs no I/O. `Preserve` is explicitly non-destructive. `Discard` is only intent evidence for a future Score Storage call after the owner stack is integrated; Project Persistence does not delete score bytes itself.

## Alternatives rejected

- **Automatic attach of every unreferenced object:** cannot distinguish interrupted attach from failed cleanup after a completed detach.
- **Automatic deletion of every unreferenced object:** can destroy a PDF whose publication succeeded immediately before process death.
- **Trusting a public reconciliation struct as deletion authority:** a caller can construct stale or overlapping sets; destructive action must revalidate current classification invariants.
- **Filesystem scan inside Project Persistence:** duplicates Score Storage path and containment authority.
- **Path-returning reconciliation:** crosses the bounded-context trust boundary and exposes local storage topology without product need.
- **mtime/PID heuristics or mutable lifecycle sidecars:** time and process identity do not prove metadata durability or buyer intent.

## Security and privacy notes

Both inputs are treated as untrusted boundary data even when supplied by another BandScope owner. Every id must satisfy the canonical BandScope score-id shape and be unique within its owner set. Reconciliation failure returns `Could not reconcile score attachments.`; action-authorization failure returns `Could not authorize score attachment recovery action.`. Neither error includes paths, filenames, PDF bytes, project metadata, or the rejected id.

The service is pure and performs no I/O. It cannot weaken Score Storage's native symlink/reparse/containment checks and cannot mutate the project document. The action authorization never authorizes a `missing_referenced_score_ids` entry, so a broken durable reference cannot be silently converted into permission to delete or rewrite project truth.

## Test points

Source-level RED `3484d5169b6e9b00501f4c6bf2f48e1165d6e144` added `project_persistence_score_recovery.rs` before the production reconciliation symbol existed. The contract requires classification of matched, unreferenced-published, and missing-referenced ids; deterministic ordering; and fail-closed duplicate/malformed identities.

Causal implementation `67febe0a049e642f5ced0c8cfb355d8b1108e25b` added the pure reconciliation service. `95aee6d464f1bbdc026cd4ab20ff5739ab6c116d` exported the contract from the canonical desktop-core root.

Self-review after CI ownership wiring found that the initial error assertions called `Result<ScoreAttachmentRecoveryReconciliation, String>::as_deref()`, which is not available because the success type does not implement `Deref`. `e8f8da6ef3839e66182c3f2adca0da50f3c93d10` repairs the integration assertion and `75e5efe1be2c4f4b818d191b2ed8d79a04a38d2b` repairs the module regression by applying `err().as_deref()` to `Option<String>`. This is test-harness RCA, not a change to the reconciliation contract.

A second source-level RED, `25a3e6c93db2464de90063910ae0de58aa8e7f05`, requires explicit preserve/discard authorization for an unreferenced published id and proves that referenced, missing-reference, unknown, malformed, and forged cross-set identities cannot become cleanup authority. No hosted RED is claimed because the causal repair followed before a terminal workflow verdict.

`93a2e9ce313db949eda2fa5ee4535feb3c26af78` adds the authorization contract and opaque proof type; `9147521985c4bd8fe924c827776465d592fa1bdc` exports it from the canonical desktop-core root. `59f4c153b20aaab2d23dbe1aaad4a43ff378be60` is a no-semantics-change cleanup of the set-overlap checks before hosted settlement.

Exact-head hosted evidence must be taken only from the final unchanged head.

## Remaining integration

This contract does not yet consume the Score Storage inventory from PR #1241 because that owner is not protected/released on the Project Persistence branch. After the owner contract is integrated, the application can supply durable project attachment ids and validated Score Storage inventory ids to this service, surface `unreferenced_published_score_ids` as explicit recovery candidates, and treat `missing_referenced_score_ids` as a broken-reference condition without silently rewriting either owner.

The next buyer-facing limitation is now narrower: `Discard` can be safely authorized by identity, but a true **recover/reattach** action still lacks enough durable presentation metadata. Score Storage inventory intentionally returns only score ids, while the project attachment model also requires a display `fileName`; if process death happens after PDF publication but before project metadata durability, the original selected filename is not recoverable from the current inventory contract. The product must either add an owner-safe recovery metadata receipt or explicitly use a truthful generated recovery label. It must not pretend to have restored the original filename.

Buyer-visible preserve/discard/recover wording, keyboard and screen-reader interaction, crash-window E2E, locale coverage, and packaged recovery evidence remain separate acceptance work.
