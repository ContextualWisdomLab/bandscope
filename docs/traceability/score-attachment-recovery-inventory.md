# Score attachment recovery inventory

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Related owner: Project Persistence #970

## Problem

A score PDF can be durably published before its attachment metadata becomes durable in the project document. After restart, Project Persistence can reconcile that window only if Score Storage can report which score objects actually exist without guessing whether those objects are accepted project attachments.

The original Score Storage API could publish, read and remove a score by known id but had no restart-safe object inventory. The first inventory repair added deterministic id discovery; later repairs added content-bound receipts for mutation freshness and recoverable post-link interruption state.

## Owner boundary

Score Storage owns filesystem object truth only. It does **not** decide whether a published id is referenced by durable project metadata, whether an unreferenced object came from interrupted attach versus failed cleanup after detach, or whether the buyer wants Recover / Preserve / Discard.

Project Persistence #970 owns durable project references and buyer lifecycle intent. A consumer must compare its durable attachment references with Score Storage inventory through an explicit application/ACL boundary. Cross-service SQL, filesystem-path inference and source copying are outside this contract.

## RED and causal repair lineage

Initial inventory RED `7979ea23c2b3733c4175f7c969aa196fc6b672c5` added `score_pdf_recovery_inventory.rs`. It required fresh-process rediscovery of production-published score ids in deterministic order, stage-only abandonment recovery before inventory, and fail-closed handling for then-unresolved stage-plus-destination state. `a9acc39b2cbf06d3ed09d879ceea1b833ee10614` added the inventory implementation; `1765fa075fa10106228566d75f5727ead8ceb405` corrected its resolver dependency to the canonical crate-root containment boundary.

The id-only inventory was later found insufficient as destructive mutation authority because the same valid score id can be removed and republished with different bytes. Source RED `4d8d6c10761235c64ce5c5f70e4a0567ad5d4383`, refined by `c1a4c78da0f4d76c67967dc2d05df5019599d511`, established the same-id ABA case. The repair added path-free `{score_id, content_sha256}` receipts and lease-scoped fresh receipt validation before deletion. See `score-attachment-recovery-object-receipt.md`.

Post-link source RED `1ce4bb86864ef845d39f7cb80614a2b686213499` then established a process-death state where synchronized `.score-<uuid>.stage` and hard-linked `<uuid>.pdf` both survive. Causal repair `48a7ccfab996330fa415e68afaabc34782d62ad4` makes equal validated stage/destination bytes recoverable by retiring only the temporary stage alias while preserving the destination as a published recovery candidate. Content-different or indeterminate pairs still preserve both and fail closed. See `score-attachment-post-link-recovery.md`.

## Inventory contract

Before returning published-object truth, the owner:

- validates and acquires the cross-process Score Storage workspace lease;
- runs abandoned-stage recovery while that lease is held;
- removes a stage-only orphan through the existing object-deletion boundary;
- for stage plus destination, validates both bounded PDF byte streams and retires only the stage alias when their shared-kernel SHA-256 identities are equal;
- preserves both and fails closed when stage/destination bytes differ or validation is indeterminate;
- enumerates only exact `<valid-score-id>.pdf` names;
- resolves every matching owned name through the existing native containment/symlink guard;
- ignores unrelated filenames instead of broadening Score Storage ownership;
- sorts results deterministically;
- returns no local paths, selected-source filenames or PDF payload bytes.

`inventory_published_score_pdf_ids` remains discovery-only compatibility surface. `inventory_published_score_pdf_receipts` is the mutation-freshness observation surface: each receipt binds the validated logical id to the SHA-256 of the current bounded PDF bytes while the lease is held. The digest is equality/content identity only, not authenticity, provenance or durable project acceptance.

The lease makes inventory stable with respect to another writer using the current contract. It does not make an older build that never takes the lease compatible.

## Mutation freshness

A recovery decision must not delete by score id alone. `remove_score_pdf_attachment_if_receipt_matches` reacquires the same Score Storage lease, performs recovery, computes the current receipt and removes only when the supplied receipt still matches. A missing object or digest mismatch is a safe non-removal; suspicious or indeterminate storage remains an error.

This closes `A removed -> same id republished as B -> stale decision for A` at the storage owner. It does not authorize the higher-level decision to discard. Project Persistence/application orchestration must separately prove current project identity, fresh recovery classification and explicit buyer intent.

## Alternatives rejected

Scanning the scores directory from React is rejected because it exports filesystem authority across the native boundary and duplicates Score Storage validation. Treating every `*.pdf` as owned is rejected because unrelated or attacker-planted names broaden the recovery/deletion namespace. Returning absolute paths is rejected because consumers need opaque object identity, not filesystem authority.

Automatic attachment or deletion of unreferenced ids is rejected because byte existence cannot reveal durable project intent. Id-only destructive authority is rejected because same-id ABA can apply stale intent to replacement bytes. Blind deletion of either side of stage-plus-destination is rejected because one side may be the only durable buyer copy; permanent rejection of every equal-content post-link state is also rejected because a valid current-contract crash would wedge the workspace indefinitely.

A mutable sidecar lifecycle ledger is not introduced in this slice. It would create a second persistence protocol whose crash semantics would themselves need reconciliation with the project document.

## Security Notes

**Untrusted input.** Every directory entry under the score workspace is untrusted. Only exact reserved stage names and exact valid score-id PDF names enter the owned recovery/inventory namespace.

**Trust boundary.** App-owned score workspace → OS-held Score Storage lease → abandoned/publication recovery → exact owned-name parsing → existing native containment resolver and bounded PDF validator → id inventory or content receipt.

**Safe failure.** Lease contention, unreadable directory state, suspicious matching objects, unsafe resolution, content-different stage/destination state and stale receipt mismatch do not fall back to destructive guessing. Equal-content post-link recovery removes only the temporary stage alias and preserves published bytes.

**Privacy.** The APIs expose BandScope-generated score ids and, for receipts, lowercase SHA-256 content identity. They do not return local paths, original selected filenames or PDF bytes.

## Test points

`score_pdf_recovery_inventory` covers fresh-process rediscovery of production-published objects, deterministic ordering, unrelated-file exclusion and stage recovery before listing. `score_pdf_interruption_recovery` covers stage-only process termination and post-link process termination. `score_pdf_recovery_object_receipt` covers same-id remove/republish ABA and fresh receipt-bound deletion. Existing publication/retention/restart/wiring regressions remain in the same owner workflow.

## Claim boundary and next step

Score Storage now provides restart object discovery, content-bound mutation freshness and non-destructive recovery for current-contract stage-only and equal-content post-link process death. It still does **not** identify which objects are referenced by the durable project document, infer original display filenames, decide Recover / Preserve / Discard, or provide buyer-visible recovery UX.

Until #865 and #1241 integrate and #970 consumes a protected/released Score Storage contract, `PDF durable -> metadata not durable` remains an open commercial gap. The consumer flow must combine durable project attachment ids, active project identity and fresh Score Storage receipts, then re-read both owner truths immediately before a mutation. `missing_referenced_score_ids` remains a broken-reference condition rather than cleanup authority.

Still open at the Score Storage owner: old unleased-build compatibility, explicit cancellation, disk-full, permission failure, power-loss durability, complete project deletion/recovery rollback, the remaining Unix final basename race, packaged fault evidence and release/signing settlement.
