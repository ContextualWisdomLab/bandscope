# Playback source session traceability

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer playback-source session
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `9c1b20e6df778e303fada3e170c93418c496394b`
- **Stem publication parent:** PR #1159 `22a9f18d960cc7df93db890b2a5aa9594428c2b4`
- **Current native/UI child source head:** PR #1160 `d37a7b8890357e08e7691a64f8ac09c0417f2048`

## Problem

Native playback authority can revoke a previously admitted generated-stem set when a newer analysis starts, the local project changes, the underlying file identity changes, or source availability otherwise fails closed. The renderer already has a strict availability projector and native discovery adapter, but an asynchronous discovery result also needs a lifetime. Without a request/session identity, a response for an older project or older authority snapshot can repopulate stem controls after the renderer has rotated to a newer full-mix authority.

The buyer-visible failure mode is not limited to stale text. A stale source control can point at an authority that native playback has already revoked. BandScope therefore treats playback-source availability as a revocable snapshot rather than durable UI state.

## Test-first contract

Commit `899f122e721cd48f998deea2144beedf558602ee` adds `playbackSourceSession.test.ts` before the production session implementation exists. The contract requires:

- initial state exposes only the already-owned full mix and never invents stems;
- beginning a refresh immediately clears previously discovered stems and resets selection to full mix;
- a discovery completion for an older full-mix authority cannot overwrite a newer project's pending request or options;
- partial, duplicate, project-mismatched, path-shaped, malformed and non-array completions fail closed to full-mix-only state; and
- selection is admitted only from the latest canonical option set.

This commit is source-level RED lineage. No hosted exact-head execution receipt is claimed for it.

## Causal source repair

Commit `d37a7b8890357e08e7691a64f8ac09c0417f2048` adds `playbackSourceSession.ts` and reuses `derivePlaybackSourceOptions` as the renderer authority/project/all-or-none source validator rather than introducing a second parsing rule.

`PlaybackSourceSession` owns the current full-mix authority, current canonical options, current selection, one pending discovery identity and a request sequence. `beginPlaybackSourceDiscovery` immediately retracts all stem options before an asynchronous refresh begins. `completePlaybackSourceDiscovery` applies a result only when the request sequence and full-mix authority still match the current pending request and current project authority. Invalid results remain full-mix-only. `selectPlaybackSource` cannot select an authority outside the current option snapshot.

The implementation accepts only opaque `bandscope-project://...` authorities already admitted by the existing renderer projector. It does not create native authority, expose a path/hash/file identity, or change the native `PlaybackAuthority` owner.

## Concurrent source-switch continuity delta adopted

The branch advanced concurrently before this repair. That movement was reviewed and retained rather than treated as a race:

- `d3df37675c109dc192322f282b0154f247bd1f2d` adds test-first transport continuity requirements for looping, paused and armed source changes and rejects count-in/idle/out-of-loop transitions.
- `4b78eabe030b16d769fc13830ddfc440e26b04f0` adds `capturePlaybackSourceSwitch` and `admitPlaybackSourceSwitchTarget`. A switch plan preserves the selected loop, exact admitted position and playback rate, resumes only a previously looping transport, and rejects a target whose decoded duration cannot cover the complete selected loop.

These pure contracts do not themselves change the mounted media source.

## Current acceptance boundary

The renderer-side authority/session contracts are not the finished selector. `RehearsalPlayer` still uses `audioSourcePath` directly, pauses and reloads when its resolved media URL changes, and does not yet call `discoverPlaybackSourceOptions`, bind the resulting session, render `Full mix | Vocals | Bass | Drums | Other instruments`, or apply the source-switch plan around the actual media `load()` lifecycle.

Current locale infrastructure supports English and Korean only. JA/ZH/VI/ES/DE/FR expansion, text expansion/CJK fallback checks, pointer/touch/keyboard/screen-reader interaction, persistence/reload, stale/revocation UI behavior and rights-cleared audible macOS/Windows acceptance therefore remain open.

Fresh Actions lookup for exact head `d37a7b8890357e08e7691a64f8ac09c0417f2048` returned no pull-request workflow runs. Commit statuses currently contain CodeRabbit and Devin Review success only; these are not substitutes for the 14 protected repository/central required contexts or qualifying independent unchanged-head approval. PR #1160 remains Draft.

## Delivery gate

**FAIL.** Stale discovery-session admission and pure source-switch continuity are represented in source, but the mounted selector, actual media-switch continuity, current-head required CI/security/coverage/build evidence, eight-locale UI evidence and real-audio desktop acceptance are not complete.
