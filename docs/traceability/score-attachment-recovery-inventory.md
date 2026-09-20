# Score attachment recovery inventory

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

A score PDF can be durably published before its attachment metadata becomes durable in the project document. After a process restart, Project Persistence can only reconcile that window if Score Storage can report which score objects actually exist without guessing whether those objects are accepted project attachments.

The pre-repair Score Storage API could publish, read and remove a score by known id, and could recover a stage-only artifact before the next publication. It had no restart-safe inventory contract. Project Persistence therefore had no narrow owner API from which to derive `published object - durable project reference` candidates.

## Owner boundary

Score Storage owns filesystem object truth only. `inventory_published_score_pdf_ids` returns validated score ids for safely published `<uuid>.pdf` objects. It does **not** decide whether an id is referenced by durable project metadata, whether an unreferenced object came from interrupted attach versus failed cleanup after detach, or whether the buyer wants to recover or discard it.

Project Persistence #970 remains responsible for durable project references and any later reconciliation decision. A future consumer must compare its own durable attachment references against this object inventory through an explicit application/ACL boundary. Cross-service SQL, filesystem-path inference and source copying are not part of this contract.

## RED and causal repair

`7979ea23c2b3733c4175f7c969aa196fc6b672c5` added `score_pdf_recovery_inventory.rs`. The regression requires a fresh native process to rediscover two production-published score ids in deterministic order, requires stage-only abandonment to be recovered before inventory, and requires stage-plus-destination ambiguity to remain preserved and fail closed. `25fcd0a31e948c7caef68bcc17ce7e3813c21675` put that regression in the owned macOS/Windows Score Storage workflow. At that source identity the public inventory symbol did not exist, so the new target is a deterministic source RED; no hosted RED is claimed unless a terminal run for that exact test-only lineage is available.

`a9acc39b2cbf06d3ed09d879ceea1b833ee10614` added the inventory implementation. Self-review then found that its containment resolver import named the wrong sibling owner. `1765fa075fa10106228566d75f5727ead8ceb405` repaired that dependency to the canonical crate-root `resolve_existing_score_pdf` boundary rather than duplicating read-time path validation.

The public crate-root API is re-exported by `f7b31910fe203b42c1c595044a7e884946fe6b1d` and retained at the current descendant head.

## Inventory contract

Before returning any object ids, the owner:

- validates and acquires the existing cross-process Score Storage workspace lease;
- runs the existing abandoned-stage recovery while that lease is held;
- fails closed if stage-plus-destination state is ambiguous;
- enumerates only exact `<valid-score-uuid>.pdf` names;
- resolves every matching owned name through the existing bounded containment/symlink guard;
- ignores unrelated filenames instead of broadening Score Storage ownership;
- sorts returned ids deterministically;
- returns ids only, never local paths, selected-source filenames or PDF payload bytes.

The lease makes the inventory a stable observation with respect to another current-contract writer. It does not make older builds that never take the lease compatible.

## Alternatives rejected

Scanning the scores directory from React is rejected because it exports filesystem authority across the native boundary and duplicates Score Storage validation. Treating every `*.pdf` as owned is rejected because unrelated or attacker-planted names would broaden the deletion/recovery namespace. Returning absolute paths is rejected because consumers need object identity, not filesystem authority. Automatically attaching or deleting unreferenced ids is rejected because Score Storage cannot infer Project Persistence lifecycle intent.

A mutable sidecar lifecycle ledger is not introduced in this slice. It would create a second persistence protocol whose crash semantics must themselves be reconciled with the project document. The narrower object inventory is sufficient to let the canonical owners meet at an ACL later without pretending that byte existence equals project acceptance.

## Security Notes

**Untrusted input.** Every directory entry under the scores workspace is untrusted. Only an exact valid score-id filename enters the owned inventory.

**Trust boundary.** App-owned score workspace → OS-held Score Storage lease → abandoned-stage recovery → exact owned-name parsing → existing native containment resolver → score-id-only inventory.

**Safe failure.** Lease contention, unreadable directory state, suspicious matching objects, unsafe resolution and stage-plus-destination ambiguity fail closed. The inventory never converts ambiguity into delete or project metadata mutation.

**Privacy.** The API exposes only BandScope-generated score ids. It does not return local paths, original selected filenames or PDF bytes.

## Test points

`score_pdf_recovery_inventory` covers fresh-process rediscovery of production-published objects, deterministic ordering, ignoring an unrelated `notes.pdf`, stage-only cleanup before listing, and preservation/failure for stage-plus-destination ambiguity. Existing Score Storage unit and publication/retention/interruption/restart/wiring regressions remain in the same owner workflow.

## Claim boundary and next step

This slice creates the Score Storage half of restart reconciliation. It does **not** identify which returned ids are referenced by the durable project document, recover attachment metadata, infer original display filenames, delete unreferenced objects, or provide buyer-visible recovery UX. Those decisions require #970 Project Persistence integration and a narrow consumer contract that compares durable project references against this object inventory.

Until that consumer exists, `PDF durable -> metadata not durable` remains an open commercial gap. The correct next step is to integrate the protected Project Persistence owner, pass durable attachment ids rather than filesystem paths across the ACL, and expose ambiguous candidates to a buyer-visible recovery decision without automatic attach/delete.