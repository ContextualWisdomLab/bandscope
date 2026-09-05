# Mounted playback-source selector traceability

Status: Draft implementation evidence for PR #1160. This document does not promote the stack to shipped or release-ready state.

## Problem

The native playback boundary already exposed a renderer-safe availability command and the renderer already had canonical option, session, discovery, and source-switch receipt contracts. The mounted `RehearsalPlayer`, however, still consumed only the full-mix `audioSourcePath`. A rehearsing musician therefore had no buyer-visible way to choose the atomically admitted vocals, bass, drums, or other-instruments source even when native authority had registered the complete stem set.

The selector must not create a second playback authority. It may display only the current native project's opaque authorities, must not expose filesystem paths, and must fail closed when native availability is partial, malformed, stale, revoked, or from another project.

## Test-first evidence

RED commit `6a9f892f08d5ebc7c8e67bb7372401f3d64b5e58` adds mounted-component regressions requiring all of the following:

- `get_playback_source_availability` is called with only the current opaque full-mix authority;
- the complete atomic set is rendered in canonical `Full mix`, `Vocals`, `Bass`, `Drums`, `Other instruments` order;
- selecting vocals routes only the opaque stem authority through the existing `bandscope-playback` URL conversion boundary;
- partial native availability never becomes buyer-selectable stem UI.

The pre-existing player had no source-selector group and no native availability call, so that contract was intentionally RED at the source level. No hosted CI receipt existed for that RED head.

## Minimal mounted composition

Causal implementation commit `88ded97b67f6b63bdccacd7226c3b9518b668e9b` keeps `RehearsalPlayer` as the public Workspace entry point and moves the existing transport implementation verbatim to `RehearsalPlayerCore`. The public wrapper owns only renderer-safe availability/session projection and passes one selected opaque authority into the existing transport owner.

The wrapper starts each project with full mix only, calls `beginPlaybackSourceDiscovery`, invokes the existing renderer-safe discovery boundary, completes only the exact issued discovery receipt, and lets `PlaybackSourceSession` decide whether an option is current. It renders native radio controls only when the canonical snapshot contains more than full mix. Partial or invalid discovery therefore leaves the existing full-mix player usable without advertising stems.

Native radio semantics were chosen over a bespoke segmented-control state machine because pointer, touch, keyboard selection, checked state, and accessible naming are already defined by the platform. Styling is deliberately subordinate to the existing rehearsal surface rather than introducing another decorative card or generic dashboard pattern.

## Project-rotation race

The first mounted composition exposed a narrower stale-render window: when the parent changed from project A to project B, React could render once with project A's previously discovered session before the effect reset it. That could briefly pass A's selected stem into the transport child or leave A's source choices visible while B was already the mounted full-mix authority.

Regression commit `ad96e16ac54246d1dd70922ecd64f262412dc713` adds a delayed project-A discovery and a project-B rotation, then requires the late A result never to repopulate B's selector. Review of that lifecycle identified the synchronous render window as an additional finding.

Causal fix `71c03bcc12de4806804d93db45e1d8f0ea764668` now treats a session as renderable only when `sourceSession.fullMixAuthority === audioSourcePath`. During project rotation the wrapper immediately hides the old option snapshot and passes the newly mounted full-mix authority to the transport child before asynchronous discovery begins. The existing exact-request completion and effect cancellation remain the second line of stale-response defense.

## Multi-mount radio isolation

Review after mounting also found that a constant HTML radio `name` would join source controls from two independently mounted rehearsal players into one browser radio group. That does not occur in the current single Workspace surface, but it is an invalid reusable-component contract and can make selecting a source in one mount visually uncheck another mount without changing its React authority state.

RED commit `6e928262d8bbcba0845fcb04a1dc09c095e23434` adds two independently mounted players and requires both full-mix radios to remain selected until their own component changes. Causal fix `29b51d7778624ec0d887f256a10fc93420220971` scopes the native radio `name` with React `useId()`. Browser keyboard/radio semantics remain native while independent component instances no longer share selection state.

A focused TypeScript 5.8.3 `--strict` compile of the exact public wrapper with contract-compatible stubs passed after the fix. This checks the new wrapper's type/syntax surface only; it is not repository exact-head CI evidence and does not substitute for the real workspace test suite.

## Discovery waiting-state accessibility

Fresh mounted review found that `beginPlaybackSourceDiscovery` correctly removes stale stem controls while native availability is pending, but the UI gave no visible or programmatically determinable explanation for that temporary disappearance. The same silent waiting state occurred on first discovery and after error-driven revocation refresh. This is a buyer-visible loading-state gap rather than a playback-authority gap: full mix remains usable, but the user should be told why stem choices are temporarily unavailable.

RED commit `c55e15d1884fcb8cfa750ed3434b498917858bbb` holds native availability unresolved and requires the mounted player to expose `Checking playback sources…` as a `status` while the canonical stem snapshot is pending, with no premature stem radio group. Causal fix `1e2eb0b1654a368286e05b242680d14b0b147020` derives the waiting state only from the current project's exact `PlaybackSourceSession.pendingRequest`, adds EN/KO screen copy under the existing locale owner, and removes the status when that exact discovery settles. It does not add a spinner, new request store, polling loop, or synthetic stem option.

WAI-ARIA defines `status` as an advisory live region whose implicit `aria-live` value is `polite` and whose implicit `aria-atomic` value is `true`. WCAG 2.2 Success Criterion 4.1.3 requires status messages about application waiting/progress states to be programmatically determinable without moving focus. W3C's ARIA22 technique additionally notes that some environments do not reliably treat `status` as atomic by default. Compatibility RED `ff7b418633cdf053d6a9c46d00282590bb7876ec` therefore requires explicit `aria-atomic="true"`; causal fix `b9592814a24969ff65176e45b545e660429323c2` adds that compatibility attribute without changing focus or escalating the message to an interruptive `alert`.

The status copy remains presentation only. It cannot select a source, mint authority, prolong a receipt, or make a partial stem set visible. JA/ZH/VI/ES/DE/FR and the DB-backed versioned translation ledger remain the wider #965/product localization owner rather than being duplicated here.

### Accessibility references

World Wide Web Consortium. (2023, June 6). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria-1.2/

World Wide Web Consortium. (n.d.). *Understanding Success Criterion 4.1.3: Status messages*. Retrieved September 5, 2026, from https://www.w3.org/WAI/WCAG22/Understanding/status-messages

World Wide Web Consortium. (n.d.). *ARIA22: Using `role=status` to present status messages*. Retrieved September 5, 2026, from https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22

## Mounted revocation and reselection

Native `PlaybackAuthority` deliberately revokes the prior generated stem set when a newer stem analysis starts or when authority moves to another generation. The mounted selector therefore cannot treat a previously discovered stem as durable just because its radio option is still in renderer state.

Fresh RED commit `4e9276c7e782add0ef02a1f6a7435bb93eb7af43` selects `Vocals`, raises an actual media `error` from the mounted rehearsal `<audio>` element, and requires the selector to discard every stem immediately, fall back through the existing full-mix authority, and issue a new `get_playback_source_availability` request before any stem can be selected again. The refresh is intentionally left unresolved during the assertion so stale buyer-visible options cannot be justified by a fast IPC response.

Causal fix `24040b4cd23629de5f60dbb0a0b54c40e212dec4` keeps the repair in the UI composition owner. The wrapper captures media-source errors from its own mounted player, and only when the failed current selection is a stem from the current full-mix session does it call `beginPlaybackSourceDiscovery` against the existing session. That transition synchronously reduces the option snapshot to full mix and preserves the session's monotonic request sequence; the asynchronous native result may restore stem options only through the exact new discovery receipt. A generation token also prevents any earlier async discovery from committing after a newer project or revocation refresh.

Full-mix media failures are not silently converted into a selector refresh because there is no safer local source to fall back to. The core's existing playback-error path remains authoritative for those failures. The wrapper does not mint authority, infer a native path, or poll the native registry.

## Authority and rejected alternatives

The wrapper does not mint authorities, derive native paths, copy the native registry, or persist a second source catalog. `PlaybackAuthority` remains the owner of playable bytes; `get_playback_source_availability` remains the native availability read model; `PlaybackSourceSession` remains the renderer option/session authority.

Rendering partial stem sets was rejected because native publication is atomic. Keeping the previous project's options visible during refresh was rejected because revocable authority cannot outlive the snapshot that established it. A second transport store in the wrapper was rejected because the existing rehearsal transport remains canonical. Periodic polling was rejected because `beginPlaybackSourceDiscovery` correctly revokes visible stem options at refresh start; polling would therefore create repeated selector disappearance and unnecessary native work. Treating a failed stem as selectable until the next unrelated render was rejected because a revoked source is no longer buyer truth. A blocking modal or `alert` for normal discovery was rejected because discovery is advisory progress and full-mix playback remains available; changing context or interrupting speech would overstate the condition.

## Current media transaction and remaining buyer gap

The selector is now connected to `RehearsalPlayerCore`'s source-switch transaction. Same-project source replacement issues the existing switch receipt before `audio.src` mutation, gates transport while metadata is pending, admits only the exact active plan/target/duration, restores seek and playback rate, and retires the receipt on success or failure. Project/generation rotation remounts the transport owner rather than inheriting prior project state, and a replaced source's unresolved `play()` Promise is retired before it can report an error against the next source. Those details are maintained in `mounted-playback-source-switch-transaction.md`.

Commercial delivery remains incomplete. Selected-source persistence/reload, discovery failure/empty-state product copy where a distinct buyer action is warranted, translation-ledger integration for source labels/status, JA/ZH/VI/ES/DE/FR plus CJK/text-expansion/font-fallback evidence, responsive/browser and screen-reader E2E, and rights-cleared audible Windows/macOS acceptance remain open. The new waiting-state and revocation behavior also still need exact-head hosted browser/component evidence rather than source-level test/fix evidence alone.

Until those paths and current-head protected CI/review gates are GREEN, the UI Delivery Gate remains FAIL.
