# Mounted playback-source selector traceability

Status: Draft implementation evidence for PR #1160. This document does not promote the stack to shipped or release-ready state.

## Problem

The native playback boundary already exposed a renderer-safe availability command and the renderer already had canonical option, session, discovery, and source-switch receipt contracts. The mounted `RehearsalPlayer`, however, still consumed only the full-mix `audioSourcePath`. A rehearsing musician therefore had no buyer-visible way to choose the atomically admitted vocals, bass, drums, or other-instruments source even when native authority had registered the complete stem set.

The selector must not create a second playback authority. It may display only the current native project's opaque authorities, must not expose filesystem paths, and must fail closed when native availability is partial, malformed, stale, or from another project.

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

## Authority and rejected alternatives

The wrapper does not mint authorities, derive native paths, copy the native registry, or persist a second source catalog. `PlaybackAuthority` remains the owner of playable bytes; `get_playback_source_availability` remains the native availability read model; `PlaybackSourceSession` remains the renderer option/session authority.

Rendering partial stem sets was rejected because native publication is atomic. Keeping the previous project's options visible during refresh was rejected because revocable authority cannot outlive the snapshot that established it. A second transport store in the wrapper was rejected because the existing rehearsal transport remains canonical.

## Remaining buyer gap

This increment mounts real source discovery and selection, but it does **not** complete seamless source switching. `RehearsalPlayerCore` still owns the pre-existing `audioSourceUrl` effect: a selected authority change makes playback intent inactive, clears admitted duration, pauses, replaces `audio.src`, and calls `load()`. The dedicated `PlaybackSourceSwitchSession` continuity contract is not yet connected to this mounted media lifecycle.

The next causal slice must therefore move source replacement inside the transport owner and prove one transaction:

1. choose only an authority from the current `PlaybackSourceSession`;
2. call `beginPlaybackSourceSwitch` before mutating `audio.src`;
3. keep the transport non-playing while the target loads;
4. admit `loadedmetadata` only through the exact current switch session/plan, target authority, and decoded duration;
5. restore exact seek and playback rate, resume only when the captured source phase was looping, then call `completePlaybackSourceSwitch`;
6. on load/admission failure, call `abortPlaybackSourceSwitch` before a later media event can reuse the receipt.

Persistence/reload of the selected source, native revocation while mounted, translated source labels beyond the current locale infrastructure, responsive/browser E2E, screen-reader evidence, and rights-cleared audible Windows/macOS acceptance also remain open. Until those paths and current-head protected CI/review gates are GREEN, the UI Delivery Gate remains FAIL.
