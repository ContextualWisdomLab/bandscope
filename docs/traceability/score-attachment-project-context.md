# Score attachment project-context freshness

Issue: #1239  
Canonical owner: Score Storage / Score Attachment UI boundary

## Problem

ScoreView can remain mounted while the active project changes. Before this repair, asynchronous score work captured an old `projectId` but had no project/song freshness guard. A late read could repaint the new project, a completed old-project attach could call `onSongUpdate` against the newly active UI state, and an old detach could continue from receipt lookup or metadata persistence into storage deletion after navigation.

Receipt-bound storage identity prevents same-id object ABA, but it does not by itself prove that the UI intent still belongs to the active project. Project-context freshness is therefore a separate application invariant.

The first context-key repair used a passive React effect to clear the previously selected score after a project/song change. That protected later asynchronous continuation, but React explicitly permits passive effects to run after the browser paints. For buyer-visible score content, a single stale Project A paint while Project B is already active is not an acceptable confidentiality/UI boundary.

A second same-context race remained after that repair. Detach captured the render-time `selected` value before awaiting the content receipt and project metadata persistence. A buyer could open the same score while detach was waiting; after metadata detachment was accepted, the stale closure still saw the earlier selection and could leave the now-detached PDF visible in the viewer even while Score Storage deletion proceeded.

A third same-context race remained in the metadata payload itself. Attach and detach captured render-time `song` and `scoreAttachments` values before awaiting native publication or receipt lookup. If the same `(projectId, song.id)` rerendered with newer visible song metadata while either operation was pending, the continuation could submit the older aggregate to `onSongUpdate`, overwriting the newer visible title, attachments, or other song fields. Project Persistence CAS is still required for durable multi-writer arbitration, but ScoreView must not knowingly submit a stale prop snapshot after its own asynchronous wait.

## Decision

ScoreView derives a context key from `(projectId, song.id)` and keeps the current key in a render-time ref. Every async read, attach and detach captures the key at operation start and rechecks it before any later UI mutation or lifecycle step.

A project/song change invalidates the visible score selection, PDF bytes, read request generation, opening/attaching state and stale error state in `useLayoutEffect`, so the state reset and resulting rerender complete before the browser repaint. The render-time ref changes even earlier, during render, so an old promise resolving between the new render and the layout effect already fails the freshness check.

Score selection also has a live ref synchronized with each selection transition. Detach consults that ref only after durable metadata acceptance. If the attachment being detached became selected while receipt lookup or metadata persistence was in flight, detach invalidates the read generation and clears selection, bytes and opening state before storage deletion. The decision is therefore based on the current same-context viewer state, not the render that initiated detach.

The current rendered song is likewise retained in a live ref. After native attachment publication or receipt lookup returns and the context still matches, ScoreView constructs the metadata proposal from that latest same-song snapshot and its latest `scoreAttachments`, not from the render that started the asynchronous operation. This is a UI/application freshness guard only; Project Persistence remains responsible for durable revision/CAS rejection when another writer changes the project outside the latest rendered snapshot.

Attach rechecks context after native publication and again after project metadata acceptance. If native publication completed for the old project after navigation, ScoreView does not attach that result to the new project and does not delete the bytes; the object remains a recovery candidate for higher-level reconciliation.

Detach rechecks context after receipt acquisition and again after project metadata acceptance. It therefore never invokes receipt-bound Score Storage deletion from an intent that crossed a project switch. Project Persistence remains owner of durable active-project identity and CAS semantics; this UI guard does not replace #970.

## RED and repair

`470aceb8c0e2d76f935cc0ed326204007b0c0674` adds focused UI regressions for four stale-context cases: late read, late attach, receipt lookup resolving after a project switch, and project switching while metadata persistence is pending. The previous ScoreView implementation would violate those expectations.

`7dfa1c6c7c8100619dd3eafcd9f01b153fd3cb9b` adds context-key invalidation and async revalidation. Owner self-review then compared the visible-state reset against React's documented effect timing: passive `useEffect` may allow a paint before its state reset, while `useLayoutEffect` processes its state updates before repaint. `e95de494fd3747a09fd23780188a474d51dd26ef` therefore changes only that visual invalidation boundary from passive to layout effect; async authority and storage semantics are unchanged.

`721bddc70081329c860c267cb3b83ce73531a3c8` adds the same-context selection RED: remove begins while receipt lookup is pending, the buyer opens that score, metadata detachment is then accepted, and the viewer must no longer display the detached score. The previous closure-based `selected` check retained the bytes. `9f63bd53db01949670f35a7ed8cdf7cee46bc10e` repairs the cause by tracking live selection identity and clearing the current detached selection after metadata acceptance. The RED head did not receive terminal hosted evidence before the repair descendant, so no hosted RED is claimed.

`8dd038be0f115377cda7071e2d49a909effb3013` adds same-song snapshot RED coverage for both directions. One case starts native attachment publication, rerenders the same song with a newer title and a concurrent attachment, then requires the accepted proposal to retain that newer snapshot plus the newly published score. The other starts detach receipt lookup, rerenders the same song with newer metadata and another attachment, then requires the proposal to remove only the targeted score from the newer snapshot. The prior closure-based `song`/`attachments` payload loses those concurrent visible updates.

`8529ec09254ae5c6c27d92454a1ae8a02629c27b` repairs that cause by tracking the latest rendered same-song aggregate and deriving attach/detach proposals from it only after context revalidation. No Score Storage filesystem authority moves into the UI, and no durable CAS claim is added. The RED head did not receive terminal hosted evidence before the repair descendant, so no hosted RED is claimed.

The focused regressions are owned by `score-storage-native` through the Ubuntu UI job. Hosted GREEN belongs only to an unchanged exact current head; predecessor native/UI verdicts do not transfer across this source change.

## Invariants and safe failure

- Old-project reads never update selection, PDF bytes, opening state or errors in the new project.
- Already-rendered old-project score content is cleared before the browser can paint the newly active project/song context.
- Old-project attach completion never calls project metadata mutation for the new context.
- Old-project detach receipt completion never starts metadata mutation for the new context.
- If navigation occurs while detach metadata persistence is pending, Score Storage deletion is suppressed after the persistence result returns.
- If the score being detached becomes selected while same-context detach is in flight, accepted metadata detachment invalidates that current selection and its bytes before storage deletion.
- Same-song attach/detach continuation derives its metadata proposal from the latest rendered song snapshot and preserves unrelated newer visible attachment metadata.
- A stale operation does not manufacture compensating deletion authority. Published bytes remain recoverable rather than being guessed away.
- Same-project metadata rerenders do not invalidate work because the key is based on project id and song id, not object identity.

## Claim boundary

This closes the in-component asynchronous project-switch continuation, pre-paint stale-score reset, same-context detach-selection freshness, and latest-rendered same-song payload freshness boundaries for ScoreView. The focused jsdom regressions prove the state/lifecycle authority cases; the pre-paint timing claim follows the React client rendering contract and the use of `useLayoutEffect`, not a synthetic browser-paint timer. It does not claim durable conflict freedom when another writer changes Project Persistence outside the rendered snapshot, atomicity across Project Persistence and Score Storage, shipped Tauri cancellation semantics, project deletion/recovery rollback, restart Recover/Preserve/Discard authorization, or old-build coexistence. Durable revision/CAS remains #970 acceptance work.