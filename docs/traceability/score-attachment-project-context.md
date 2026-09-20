# Score attachment project-context freshness

Issue: #1239  
Canonical owner: Score Storage / Score Attachment UI boundary

## Problem

ScoreView can remain mounted while the active project changes. Before this repair, asynchronous score work captured an old `projectId` but had no project/song freshness guard. A late read could repaint the new project, a completed old-project attach could call `onSongUpdate` against the newly active UI state, and an old detach could continue from receipt lookup or metadata persistence into storage deletion after navigation.

Receipt-bound storage identity prevents same-id object ABA, but it does not by itself prove that the UI intent still belongs to the active project. Project-context freshness is therefore a separate application invariant.

The first context-key repair used a passive React effect to clear the previously selected score after a project/song change. That protected later asynchronous continuation, but React explicitly permits passive effects to run after the browser paints. For buyer-visible score content, a single stale Project A paint while Project B is already active is not an acceptable confidentiality/UI boundary.

## Decision

ScoreView derives a context key from `(projectId, song.id)` and keeps the current key in a render-time ref. Every async read, attach and detach captures the key at operation start and rechecks it before any later UI mutation or lifecycle step.

A project/song change invalidates the visible score selection, PDF bytes, read request generation, opening/attaching state and stale error state in `useLayoutEffect`, so the state reset and resulting rerender complete before the browser repaint. The render-time ref changes even earlier, during render, so an old promise resolving between the new render and the layout effect already fails the freshness check.

Attach rechecks context after native publication and again after project metadata acceptance. If native publication completed for the old project after navigation, ScoreView does not attach that result to the new project and does not delete the bytes; the object remains a recovery candidate for higher-level reconciliation.

Detach rechecks context after receipt acquisition and again after project metadata acceptance. It therefore never invokes receipt-bound Score Storage deletion from an intent that crossed a project switch. Project Persistence remains owner of durable active-project identity and CAS semantics; this UI guard does not replace #970.

## RED and repair

`470aceb8c0e2d76f935cc0ed326204007b0c0674` adds focused UI regressions for four stale-context cases: late read, late attach, receipt lookup resolving after a project switch, and project switching while metadata persistence is pending. The previous ScoreView implementation would violate those expectations.

`7dfa1c6c7c8100619dd3eafcd9f01b153fd3cb9b` adds context-key invalidation and async revalidation. Owner self-review then compared the visible-state reset against React's documented effect timing: passive `useEffect` may allow a paint before its state reset, while `useLayoutEffect` processes its state updates before repaint. `e95de494fd3747a09fd23780188a474d51dd26ef` therefore changes only that visual invalidation boundary from passive to layout effect; async authority and storage semantics are unchanged.

The focused regressions are owned by `score-storage-native` through the Ubuntu UI job. Hosted GREEN belongs only to an unchanged exact current head; predecessor native/UI verdicts do not transfer across this source change.

## Invariants and safe failure

- Old-project reads never update selection, PDF bytes, opening state or errors in the new project.
- Already-rendered old-project score content is cleared before the browser can paint the newly active project/song context.
- Old-project attach completion never calls project metadata mutation for the new context.
- Old-project detach receipt completion never starts metadata mutation for the new context.
- If navigation occurs while detach metadata persistence is pending, Score Storage deletion is suppressed after the persistence result returns.
- A stale operation does not manufacture compensating deletion authority. Published bytes remain recoverable rather than being guessed away.
- Same-project metadata rerenders do not invalidate work because the key is based on project id and song id, not object identity.

## Claim boundary

This closes the in-component asynchronous project-switch continuation and pre-paint stale-score reset boundary for ScoreView. The focused jsdom regression proves the state/lifecycle authority cases; the pre-paint timing claim follows the React client rendering contract and the use of `useLayoutEffect`, not a synthetic browser-paint timer. It does not claim atomicity across Project Persistence and Score Storage, shipped Tauri cancellation semantics, project deletion/recovery rollback, restart Recover/Preserve/Discard authorization, or old-build coexistence. Those remain separate acceptance work.
