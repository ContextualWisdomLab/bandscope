# Playback source session traceability

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer playback-source session and media-switch continuity
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `9c1b20e6df778e303fada3e170c93418c496394b`
- **Stem publication parent:** PR #1159 `22a9f18d960cc7df93db890b2a5aa9594428c2b4`
- **Current native/UI child source head before this documentation update:** PR #1160 `799c6b6e25a0fa290fba61f7ebdd303350f87888`

## Problem

Native playback authority can revoke a previously admitted generated-stem set when a newer analysis starts, the local project changes, the underlying file identity changes, or source availability otherwise fails closed. The renderer already has a strict availability projector and native discovery adapter, but asynchronous discovery and media loading both need explicit lifetimes.

Without a discovery request/session identity, a response for an older project or older authority snapshot can repopulate stem controls after the renderer has rotated to a newer full-mix authority. Separately, `HTMLMediaElement.loadedmetadata` is emitted by a mutable media element, not by an immutable source receipt. If two source switches overlap, metadata from the superseded load can arrive after a newer target has already replaced `src` and can incorrectly restore the older playhead/loop/resume plan unless the load is bound to an exact target and renderer sequence.

These are buyer-visible authority failures, not cosmetic state drift. A stale source control can point at revoked native authority, and a stale media receipt can resume rehearsal transport against the wrong source.

## Discovery-session test-first contract

Commit `899f122e721cd48f998deea2144beedf558602ee` adds `playbackSourceSession.test.ts` before the production session implementation exists. The contract requires:

- initial state exposes only the already-owned full mix and never invents stems;
- beginning a refresh immediately clears previously discovered stems and resets selection to full mix;
- a discovery completion for an older full-mix authority cannot overwrite a newer project's pending request or options;
- partial, duplicate, project-mismatched, path-shaped, malformed and non-array completions fail closed to full-mix-only state; and
- selection is admitted only from the latest canonical option set.

This commit is source-level RED lineage. No hosted exact-head execution receipt is claimed for it.

## Discovery-session causal source repair

Commit `d37a7b8890357e08e7691a64f8ac09c0417f2048` adds `playbackSourceSession.ts` and reuses `derivePlaybackSourceOptions` as the renderer authority/project/all-or-none source validator rather than introducing a second parsing rule.

`PlaybackSourceSession` owns the current full-mix authority, current canonical options, current selection, one pending discovery identity and a request sequence. `beginPlaybackSourceDiscovery` immediately retracts all stem options before an asynchronous refresh begins. `completePlaybackSourceDiscovery` applies a result only when the request sequence and full-mix authority still match the current pending request and current project authority. Invalid results remain full-mix-only. `selectPlaybackSource` cannot select an authority outside the current option snapshot.

The implementation accepts only opaque `bandscope-project://...` authorities already admitted by the existing renderer projector. It does not create native authority, expose a path/hash/file identity, or change the native `PlaybackAuthority` owner.

## Hostile object inspection repair

The initial normalizer still had one fail-closed hole: an object with an own throwing accessor or a Proxy whose property-descriptor trap throws could make renderer completion throw instead of collapsing to full-mix-only state.

- RED `cf77f570e9ea2356bbeb46f343bda4da4b8967b9` adds own-accessor and Proxy-trap cases and requires `completePlaybackSourceDiscovery` not to throw.
- Causal fix `5770392f9b383895ed35560275ff861ef82c9e8e` bounds option normalization with a fail-closed catch. Hostile inspection now clears the pending request and leaves only the already-owned full mix; no stem authority is manufactured or retained.

The catch is deliberately confined to untrusted discovery-payload normalization. It does not swallow unrelated player/media failures or weaken the canonical source projector.

## Source-switch continuity and stale media-receipt repair

The branch had already adopted a source-switch continuity contract:

- `d3df37675c109dc192322f282b0154f247bd1f2d` adds test-first transport continuity requirements for looping, paused and armed source changes and rejects count-in/idle/out-of-loop transitions.
- `4b78eabe030b16d769fc13830ddfc440e26b04f0` adds `capturePlaybackSourceSwitch` and `admitPlaybackSourceSwitchTarget`. A switch plan preserves the selected loop, exact admitted position and playback rate, resumes only a previously looping transport, and rejects a target whose decoded duration cannot cover the complete selected loop.

A second race remained because that plan had no immutable identity for the media load that was expected to satisfy it. A late `loadedmetadata` receipt from an older `src` could still be mistaken for the current target after a newer source selection superseded it.

- RED `5be9d68adf6612c35ce3fa062b7b2b688819cf80` extends `playbackSourceSwitch.test.ts` before the source repair. It requires the plan to capture source authority, target authority and a positive safe renderer sequence; rejects a no-op/invalid switch identity; and proves that an older target/sequence receipt cannot be admitted after a newer switch becomes current.
- Causal fix `799c6b6e25a0fa290fba61f7ebdd303350f87888` extends `PlaybackSourceSwitchPlan` with that identity. `capturePlaybackSourceSwitch` now fails closed on ambiguous/no-op identities, while `admitPlaybackSourceSwitchTarget` requires the decoded target duration, exact target authority and exact renderer sequence to match the active switch receipt before continuity can be restored.

The sequence is renderer-owned and carries no filesystem or native capability. The fix does not create a second playback authority; it only prevents a mutable media-element event from reactivating stale transport state.

## Current acceptance boundary

The renderer-side authority/session and switch-receipt contracts are not the finished selector. `RehearsalPlayer` still uses `audioSourcePath` directly, pauses and reloads when its resolved media URL changes, and does not yet call `discoverPlaybackSourceOptions`, bind `PlaybackSourceSession`, render `Full mix | Vocals | Bass | Drums | Other instruments`, or execute the source-switch plan and receipt through the actual `audio.src` → `load()` → `loadedmetadata` lifecycle.

The next source fix must therefore keep one mounted switch transaction owner: increment the renderer switch sequence when a currently selectable authority is chosen, capture continuity before replacing `src`, invalidate prior receipts immediately, admit `loadedmetadata` only against the exact current target/sequence, seek and restore playback rate only after target-duration admission, and resume only when the captured plan came from a previously looping transport. Revocation or malformed/short target media must fail closed to a non-playing state rather than silently falling back to stale transport.

Current locale infrastructure supports English and Korean only. JA/ZH/VI/ES/DE/FR expansion, text expansion/CJK fallback checks, pointer/touch/keyboard/screen-reader interaction, persistence/reload, stale/revocation UI behavior and rights-cleared audible macOS/Windows acceptance therefore remain open.

Fresh Actions lookup on the preceding exact source heads returned no pull-request workflow runs for this stacked branch. Source-level RED→fix lineage is not a substitute for the 14 protected repository/central required contexts or qualifying independent unchanged-head approval. PR #1160 remains Draft.

## Delivery gate

**FAIL.** Stale/hostile discovery-session admission, source-switch continuity, and stale media-receipt rejection are represented in source. The mounted selector, actual media-switch transaction, current-head required CI/security/coverage/build evidence, eight-locale UI evidence and rights-cleared real-audio desktop acceptance are not complete.
