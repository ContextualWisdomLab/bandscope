# Project Persistence score recovery reconciliation

## Problem

Score Storage can now produce a restart-safe inventory of validated published score ids, while the durable project document owns the score ids referenced by rehearsal metadata. Those two facts are intentionally different. After a crash between PDF publication and project metadata durability, a published id can exist without a project reference. The same byte state can also occur after metadata detach succeeded but byte cleanup failed.

Project Persistence therefore needs a path-free comparison contract before any recovery UI or mutation is allowed. Treating every unreferenced object as an interrupted attach would silently adopt data; treating every unreferenced object as garbage would erase buyer bytes.

## Constraints

- Score Storage remains the canonical owner of score object existence and native containment validation.
- Project Persistence remains the canonical owner of durable project references.
- Reconciliation accepts only opaque score ids. It does not accept filesystem paths, filenames, PDF bytes, timestamps, PIDs, or mutable sidecar state.
- Duplicate or malformed owner identities fail closed because they make lifecycle evidence ambiguous.
- Reconciliation must not auto-attach, auto-delete, retry, merge, or invent a lifecycle intent.

## Decision

`derive_score_attachment_recovery_candidates` compares two validated identity sets and returns three deterministic, mutually exclusive sets:

- `referenced_and_published_score_ids`: durable project reference and Score Storage object both exist;
- `unreferenced_published_score_ids`: a published object exists without durable project reference;
- `missing_referenced_score_ids`: durable project metadata references an object absent from the supplied storage inventory.

The unreferenced set is deliberately named as evidence, not a disposition. It can represent either an interrupted attach that a buyer may want to recover or a detach whose storage cleanup failed. Application UX must obtain an explicit decision before adopting or discarding it.

## Alternatives rejected

- **Automatic attach of every unreferenced object:** cannot distinguish interrupted attach from failed cleanup after a completed detach.
- **Automatic deletion of every unreferenced object:** can destroy a PDF whose publication succeeded immediately before process death.
- **Filesystem scan inside Project Persistence:** duplicates Score Storage path and containment authority.
- **Path-returning reconciliation:** crosses the bounded-context trust boundary and exposes local storage topology without product need.
- **mtime/PID heuristics or mutable lifecycle sidecars:** time and process identity do not prove metadata durability or buyer intent.

## Security and privacy notes

Both inputs are treated as untrusted boundary data even when supplied by another BandScope owner. Every id must satisfy the canonical BandScope score-id shape and be unique within its owner set. Failure returns the bounded generic message `Could not reconcile score attachments.` without paths or payload content.

The service is pure and performs no I/O. It cannot weaken Score Storage's native symlink/reparse/containment checks and cannot mutate the project document.

## Test points

Source-level RED `3484d5169b6e9b00501f4c6bf2f48e1165d6e144` added `project_persistence_score_recovery.rs` before the production symbol existed. The contract requires classification of matched, unreferenced-published, and missing-referenced ids; deterministic ordering; and fail-closed duplicate/malformed identities.

Causal implementation `67febe0a049e642f5ced0c8cfb355d8b1108e25b` added the pure reconciliation service. `95aee6d464f1bbdc026cd4ab20ff5739ab6c116d` exported the contract from the canonical desktop-core root.

Self-review after CI ownership wiring found that the initial error assertions called `Result<ScoreAttachmentRecoveryReconciliation, String>::as_deref()`, which is not available because the success type does not implement `Deref`. `e8f8da6ef3839e66182c3f2adca0da50f3c93d10` repairs the integration assertion and `75e5efe1be2c4f4b818d191b2ed8d79a04a38d2b` repairs the module regression by applying `err().as_deref()` to `Option<String>`. This is test-harness RCA, not a change to the reconciliation contract.

No hosted RED is claimed for the test-only head because descendant repair commits were pushed before a terminal workflow verdict was available. Exact-head hosted evidence must be taken only from the final unchanged head.

## Remaining integration

This contract does not yet consume the Score Storage inventory from PR #1241 because that owner is not protected/released on the Project Persistence branch. After the owner contract is integrated, the application can supply durable project attachment ids and validated Score Storage inventory ids to this service, surface `unreferenced_published_score_ids` as explicit recovery candidates, and treat `missing_referenced_score_ids` as a broken-reference condition without silently rewriting either owner.

Buyer-visible recover/keep/discard wording, keyboard and screen-reader interaction, crash-window E2E, locale coverage, and packaged recovery evidence remain separate acceptance work.
