# Score attachment project-context freshness

Issue: #1239  
Canonical owner: Score Storage / Score Attachment UI boundary

## Problem

ScoreView can remain mounted while the active project changes. Before this repair, asynchronous score work captured an old `projectId` but had no project/song freshness guard. A late read could repaint the new project, a completed old-project attach could call `onSongUpdate` against the newly active UI state, and an old detach could continue from receipt lookup or metadata persistence into storage deletion after navigation.

Receipt-bound storage identity prevents same-id object ABA, but it does not by itself prove that the UI intent still belongs to the active project. Project-context freshness is therefore a separate application invariant.

## Decision

ScoreView derives a context key from `(projectId, song.id)` and keeps the current key in a render-time ref. Every async read, attach and detach captures the key at operation start and rechecks it before any later UI mutation or lifecycle step.

A project/song change invalidates the visible score selection, PDF bytes, read request generation, opening/attaching state and stale error state. The render-time ref changes before effects run, so an old promise resolving between the new render and the cleanup effect still fails the freshness check.

Attach rechecks context after native publication and again after project metadata acceptance. If native publication completed for the old project after navigation, ScoreView does not attach that result to the new project and does not delete the bytes; the object remains a recovery candidate for higher-level reconciliation.

Detach rechecks context after receipt acquisition and again after project metadata acceptance. It therefore never invokes receipt-bound Score Storage deletion from an intent that crossed a project switch. Project Persistence remains owner of durable active-project identity and CAS semantics; this UI guard does not replace #970.

## RED and repair

`470aceb8c0e2d76f935cc0ed326204007b0c0674` adds focused UI regressions for four stale-context cases: late read, late attach, receipt lookup resolving after a project switch, and project switching while metadata persistence is pending. The previous ScoreView implementation would violate those expectations.

`7dfa1c6c7c8100619dd3eafcd9f01b153fd3cb9b` adds the minimal context-key invalidation and revalidation logic in ScoreView. The tests are owned by `score-storage-native` through the focused Ubuntu UI job.

No hosted GREEN is claimed until an exact-current-head owner run reaches terminal success.

## Invariants and safe failure

- Old-project reads never update selection, PDF bytes, opening state or errors in the new project.
- Old-project attach completion never calls project metadata mutation for the new context.
- Old-project detach receipt completion never starts metadata mutation for the new context.
- If navigation occurs while detach metadata persistence is pending, Score Storage deletion is suppressed after the persistence result returns.
- A stale operation does not manufacture compensating deletion authority. Published bytes remain recoverable rather than being guessed away.
- Same-project metadata rerenders do not invalidate work because the key is based on project id and song id, not object identity.

## Claim boundary

This closes the in-component async project-switch race for ScoreView. It does not claim atomicity across Project Persistence and Score Storage, shipped Tauri cancellation semantics, project deletion/recovery rollback, restart Recover/Preserve/Discard authorization, or old-build coexistence. Those remain separate acceptance work.
