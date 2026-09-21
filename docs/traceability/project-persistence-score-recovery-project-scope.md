# Project Persistence score recovery project scope

## Problem

Score recovery intent is created while one app-owned project aggregate and one durable project revision are active. Revalidating only the score lifecycle sets is insufficient. Project A and Project B can both classify the same opaque score id as `unreferenced_published`; the same Project A can also move from durable revision R1 to R2 while the score candidate sets remain unchanged. A recovery choice authorized under the old aggregate state must not become metadata or later mutation authority after either change.

This is separate from the existing stale-reconciliation race. Fresh score evidence can remain identical while the aggregate identity or durable project content changed.

## Constraints

- Project Persistence owns app-owned project identity, durable project revision/CAS, and durable attachment references.
- The revision token is the canonical lowercase SHA-256 content revision returned by the existing workspace persistence boundary; this recovery layer does not mint a parallel version counter.
- Score Storage continues to own whether a score object exists; no filesystem path or PDF byte crosses this boundary.
- Recovery intent is session-local. It is not a durable capability and cannot survive a lifecycle-state change, project switch, or same-project revision change.
- The canonical `project-<nanos>-<counter>` validator is reused; this layer does not invent a parallel project-id grammar.
- Errors remain bounded and do not include project ids, revisions, score ids, paths, filenames, or PDF content.
- Preserve, Recover, and Discard remain explicit buyer decisions. This contract performs no storage or project mutation.

## Decision

`ProjectScopedScoreRecoveryAction` wraps the existing opaque score-recovery authorization together with the validated app-owned project id and durable project revision that authorized it.

`authorize_project_scoped_score_recovery_action` validates the project id and canonical lowercase 64-hex revision before delegating score-set and explicit-decision checks to the existing recovery domain. The accepted revision is retained inside the opaque action rather than trusted again from UI state.

`revalidate_project_scoped_score_recovery_action` requires both the project id and durable revision reread at the mutation boundary to match the authorization before it delegates fresh lifecycle revalidation. A project switch or same-project revision change therefore invalidates prior intent even when the current reconciliation sets are identical.

`recovery_attachment_metadata_for_project_action` performs project-id, durable-revision, and fresh-evidence revalidation before delegating truthful recovered-metadata creation. The unscoped authorization/revalidation helpers remain crate-internal implementation details and are not exported from the desktop-core root, preventing application code from bypassing aggregate freshness by choosing a weaker public API.

## Alternatives rejected

- **Bind only to score id:** the same score id can be a recovery candidate while another project or project revision is active.
- **Bind only to project id:** a concurrent writer can change the same durable project after buyer intent is captured without changing the project id.
- **Treat matching reconciliation sets as equivalent project context:** equal score sets prove neither aggregate identity nor durable project revision.
- **Clear dialogs only in React state:** UI cleanup is not a mutation-boundary authorization contract and cannot protect restart, process-boundary, or concurrent-writer races.
- **Persist recovery authorization in the project document:** intent is ephemeral and owner truth must be reread before mutation.

## Security Notes

The scope wrapper validates project identity, durable revision encoding, and the underlying score recovery action. Cross-project and stale-revision use fail with the same generic authorization or recovered-metadata error used by the existing boundary. No rejected identity or revision is echoed. The wrapper cannot attach, delete, scan storage, or weaken Score Storage containment checks.

A SHA-256 revision here is content identity/CAS evidence, not an authenticity or cryptographic-signature claim. Its authority comes from the native Project Persistence boundary that computes and rereads the durable project bytes immediately around mutation.

## Test points

Source-level RED `3aaf84d9dd34b3f7f7c12f17cd4a9ffa97b8dca9` established project-id scoping: authorize Recover for Project A, keep candidate sets unchanged, then attempt to consume the decision under Project B. The decision and metadata creation must both fail closed.

Source-level RED `26b1a48248104236bcc0a2c6439d5117845ba94f` extends the same integration contract to durable revision freshness. It updates every public recovery call to require a project revision, rejects malformed/noncanonical revision tokens, and adds the realistic same-project race: authorize Recover under R1, keep project id and candidate sets unchanged, then attempt to consume the decision after the durable project advances to R2. The test-only head cannot compile against the predecessor API, which is the intended RED; no hosted terminal RED is claimed because the production repair followed immediately.

Repair `fb97bd05b9fe16181c3c09af768c4e69771c14f8` adds the revision to `ProjectScopedScoreRecoveryAction`, validates canonical lowercase SHA-256 at authorization and revalidation, and requires an exact revision match before fresh lifecycle validation or recovered metadata can be produced. This changes no Score Storage filesystem contract and grants no delete authority.

Earlier repairs `f0fc96b67d18c9a2c168f1864a091edf835ea3e2` and `85c48a02ed8d09b11df1dd2bebf5eae60b38570f` established the scoped authorization layer and removed unscoped mutation-authority helpers from the public desktop-core surface. Native Project Persistence workflows include this source and the `project_persistence_score_recovery` integration target in their exact-head trigger/test set.

Hosted GREEN must be claimed only for the final unchanged exact head after both owner-native lanes execute the revision-bound integration contract.

## Remaining integration

The application still does not consume the Score Storage restart inventory from #1241 because that owner is not yet protected/released into #970. After owner integration, the recovery UI must bind a dialog to the active project id **and durable revision**, refresh both owner evidence plus the active Project Persistence id/revision immediately before Recover or Discard, persist Recover through Project Persistence CAS/durability, and route Discard only through a fresh Score Storage receipt-bound delete. `missing_referenced_score_ids` remains broken-reference state, never automatic cleanup authority.

A project switch or accepted same-project revision change must close or invalidate outstanding recovery choices rather than replaying them against the newly active aggregate. Buyer-visible recovery UX, all supported locale copy, keyboard/screen-reader/touch evidence, bundled-app process termination, and power-loss recovery remain separate acceptance work.