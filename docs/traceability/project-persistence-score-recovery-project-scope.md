# Project Persistence score recovery project scope

## Problem

Score recovery intent is created while one app-owned project aggregate is active. Revalidating only the score lifecycle sets is insufficient: Project A and Project B can both classify the same opaque score id as `unreferenced_published`. If a recovery dialog survives a project switch, a decision authorized for Project A could otherwise be consumed while Project B is active and become metadata or future cleanup authority for the wrong aggregate.

This is separate from the existing stale-reconciliation race. Fresh score evidence can remain identical while the aggregate identity changed.

## Constraints

- Project Persistence owns the app-owned project identity and durable attachment references.
- Score Storage continues to own whether a score object exists; no filesystem path or PDF byte crosses this boundary.
- Recovery intent is session-local. It is not a durable capability and cannot survive either a lifecycle-state change or a project switch.
- The canonical `project-<nanos>-<counter>` validator is reused; this layer does not invent a parallel project-id grammar.
- Errors remain bounded and do not include project ids, score ids, paths, filenames, or PDF content.
- Preserve, Recover, and Discard remain explicit buyer decisions. This contract performs no storage or project mutation.

## Decision

`ProjectScopedScoreRecoveryAction` wraps the existing opaque score-recovery authorization together with the validated app-owned project id that authorized it.

`authorize_project_scoped_score_recovery_action` first validates the project id, then delegates score-set and explicit-decision checks to the existing recovery domain.

`revalidate_project_scoped_score_recovery_action` requires the project id active at the mutation boundary to match the authorization's project id before it delegates fresh lifecycle revalidation. A project switch therefore invalidates prior intent even when the current reconciliation sets are identical.

`recovery_attachment_metadata_for_project_action` performs that project-scope and fresh-evidence revalidation before delegating truthful recovered-metadata creation. The unscoped authorization/revalidation helpers remain crate-internal implementation details and are no longer exported from the desktop-core root, preventing future application code from bypassing aggregate scoping by choosing the weaker public API.

## Alternatives rejected

- **Bind only to score id:** the same score id can be a recovery candidate while another project is active.
- **Treat matching reconciliation sets as equivalent project context:** equal score sets do not prove aggregate identity.
- **Clear dialogs only in React state:** UI cleanup is not a mutation-boundary authorization contract and cannot protect later native/application orchestration.
- **Persist recovery authorization in the project document:** intent is ephemeral and owner truth must be reread before mutation.

## Security and privacy notes

The scope wrapper validates both the project identity and the underlying score recovery action. Cross-project use fails with the same generic authorization or recovered-metadata error used by the existing boundary. No rejected identity is echoed. The wrapper cannot attach, delete, scan storage, or weaken Score Storage containment checks.

## Test points

Source-level RED `3aaf84d9dd34b3f7f7c12f17cd4a9ffa97b8dca9` changes the Project Persistence integration contract to require project-scoped recovery APIs and adds a realistic project-switch regression: authorize Recover for Project A, keep the candidate sets unchanged, then attempt to consume the decision under Project B. The decision and metadata creation must both fail closed. The same regression also rejects malformed project identity at authorization. No hosted RED is claimed because the causal repair followed before terminal workflow evidence.

`f0fc96b67d18c9a2c168f1864a091edf835ea3e2` adds the scoped authorization/revalidation layer. `85c48a02ed8d09b11df1dd2bebf5eae60b38570f` exposes only the scoped mutation-authority API from the canonical desktop-core root. `d87e6fe9570d71d187ac9652b49de896e0d6886d` strengthens workflow policy so the new owner source cannot change without native Project Persistence evidence; the following macOS and Windows workflow commits add that path to their exact-head triggers.

Hosted GREEN must be claimed only for the final unchanged exact head after both owner-native lanes execute the integration contract.

## Remaining integration

The application still does not consume the Score Storage restart inventory from #1241 because that owner is not yet protected/released into #970. After owner integration, the recovery UI must bind a dialog to the active project id, refresh both owner evidence and active project identity immediately before Recover or Discard, persist Recover through Project Persistence CAS/durability, and route Discard only through Score Storage. A project switch must close or invalidate outstanding recovery choices rather than replaying them against the newly active project.
