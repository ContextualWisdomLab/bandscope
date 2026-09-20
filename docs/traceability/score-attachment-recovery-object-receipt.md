# Score attachment recovery object receipt

## Problem

The restart inventory introduced for #1239 deliberately returned validated `score_id` values only. That was sufficient for discovery but not for mutation authority. A score can be removed and another PDF can later be published under the same valid id. A recovery decision made for the first object would then have the same logical id as the replacement object even though the buyer bytes changed. Treating the id as durable object identity creates a same-id ABA window for recovery `Discard` and any later mutation that relies on stale inventory state.

## Constraint and owner boundary

Score Storage owns published PDF byte/object truth, its cross-process workspace lease, bounded PDF validation and native identity-safe deletion. Project Persistence owns durable project references and recovery intent. This change does not let Project Persistence scan the score directory, infer lifecycle state, or delete bytes directly.

The receipt is therefore narrow and path-free: validated `score_id` plus lowercase SHA-256 of the current bounded PDF bytes. It exposes neither the app-private path, original selected filename nor PDF payload. SHA-256 is used only as content identity for equality; it is not a signature, authenticity proof, provenance claim or FIPS 140 validation claim.

## Decision

`inventory_published_score_pdf_receipts` acquires the existing Score Storage workspace lease, performs existing abandoned-stage recovery, enumerates only validated owned score names, validates the current PDF through the established bounded read contract and computes a content receipt before releasing the lease.

`remove_score_pdf_attachment_if_receipt_matches` reacquires that same lease and keeps it across abandoned-stage recovery, current-object receipt calculation, equality comparison and the existing native identity-safe remover. A missing current object or different content receipt is a safe non-removal (`Ok(false)`); suspicious or indeterminate filesystem state fails closed.

The existing id-only inventory remains available for discovery compatibility. Recovery mutation must use the receipt-bearing contract when object freshness matters.

## Shared kernel adoption

The SHA-256 implementation is the same generic `content_sha256` shared-kernel implementation already present on Project Persistence #970. This lane adopts that existing implementation rather than adding a second algorithm or dependency. When the owner stacks are reconciled, the identical shared-kernel delta must be consolidated rather than retained as parallel source copies.

The implementation follows NIST FIPS 180-4 SHA-256 operations and includes published known-answer vectors. No new cryptographic dependency, network call or provider is introduced.

## Regression and causal repair

Source RED `4d8d6c10761235c64ce5c5f70e4a0567ad5d4383`, refined by `c1a4c78da0f4d76c67967dc2d05df5019599d511`, creates object A, inventories its receipt, removes A, republishes different bytes B under the same score id, then requires stale receipt A to preserve B while fresh receipt B can remove exactly B. The RED is source-level unless a terminal failing hosted run independently reaches the intended stale-receipt assertion; missing API compilation alone is not promoted to hosted RED.

Causal repair is the receipt-bearing Score Storage contract: path-free receipt inventory plus lease-scoped compare-and-delete. The test intentionally uses the production publisher and production remover rather than generated arrays or a fake filesystem lifecycle.

Exact `b252cac4abf91d2722a2f9e87e8cbf949dd4d41d` produced terminal macOS and Windows owner failures before the intended ABA assertion. Both platforms passed Score Storage unit tests and the shared SHA-256 known-answer test, then the new integration fixture failed its first production publication with `Could not recover the score workspace.`. RCA showed the test created only the fixture parent while production admission correctly requires the app-owned `scores` workspace to pre-exist before acquiring its lease. `ee7995e222756aa04f6f1cd83ed2dd5e2d928afe` fixes only the fixture by creating `scores_root`; production admission was not weakened and the failed run is not evidence against the receipt contract.

## Security notes

- Untrusted state includes score workspace directory entries, PDF bytes and stale recovery decisions.
- The Score Storage workspace lease serializes current-contract writers from recovery through comparison and deletion.
- Exact score-name validation, existing containment checks, bounded PDF reads and existing native deletion identity checks remain in force.
- A digest mismatch never falls back to id-only deletion.
- Errors do not disclose buyer filesystem paths or PDF bytes.
- The receipt does not authorize a lifecycle decision by itself. Project Persistence/application orchestration must still prove that the candidate remains eligible and that the buyer chose the requested action.

## Alternatives rejected

Lifetime non-reuse tombstones were rejected for this slice because they would add a new durable lifecycle sidecar and compatibility/migration semantics solely to compensate for logical-id reuse. Filesystem inode/file-id alone was rejected because object identifiers can be reused and are platform-specific. Revalidating a receipt and then releasing the lease before deletion was rejected because it recreates a TOCTOU window. Hashing a path without the existing bounded/contained read boundary was rejected because it would create a second filesystem authority. Weakening production admission so tests may publish into a missing workspace was also rejected; app-owned workspace creation belongs to its existing orchestration boundary.

## Remaining work

The application recovery flow must consume fresh Score Storage receipts and active Project Persistence project identity immediately before Recover/Preserve/Discard execution. Recover still requires durable Project Persistence CAS acceptance before presentation as an accepted attachment. Discard must call the receipt-bound Score Storage mutation rather than id-only deletion. `missing_referenced_score_ids` remains a broken-attachment state, not cleanup authority.

Protected integration, independent review, packaged process-kill/cancellation/disk-full/permission/power-loss evidence, Windows ACL revalidation, signing/notarization, provenance/reproducibility and immutable release/update rollback remain separate gates.
