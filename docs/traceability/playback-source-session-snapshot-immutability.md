# Playback source session snapshot immutability

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer playback-source authority session
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `09bedd835475015379716292e63e6be376fceec9`
- **Stem publication parent:** PR #1159 `c27f3781ddcbcc013dce07a26c0baf6080e4b2ac`
- **RED head:** PR #1160 `a79af752577ea903875883247f8d89146c7c903a`
- **Causal source fix:** `580677af836251b62d1514024a15b8fa1527646a`

## Problem

`PlaybackSourceSession` decides which opaque native playback authorities are currently visible and selectable in the renderer. Discovery request identity, canonical option membership and `selectedAuthority` are therefore authority-bearing receipt state rather than ordinary presentation data.

The existing source returned mutable JavaScript objects and arrays. Code running after `createPlaybackSourceSession`, `beginPlaybackSourceDiscovery`, `completePlaybackSourceDiscovery`, or `selectPlaybackSource` could mutate a session, an option authority, or a pending discovery request after it had passed canonical validation. That would make the later renderer state differ from the receipt that was originally admitted, undermining the same stale/revocation boundary already enforced for `PlaybackSourceSwitchPlan`.

## Constraint

The repair must not introduce a second playback authority or parser, expose native paths/hashes/file identity, widen source kinds, keep stale stems visible during refresh, or change sequence/revocation semantics. Native `PlaybackAuthority` remains the owner of actual bytes and file identity; the existing source projector remains the authority grammar.

## Test-first evidence

Commit `a79af752577ea903875883247f8d89146c7c903a` adds `playbackSourceSession.immutability.test.ts` before the production repair. It requires:

- the initial session, option array and option object to be frozen;
- refresh state, refresh options and the issued discovery request to be frozen;
- completed canonical option snapshots to be frozen recursively at the array/option level;
- mutation of an admitted stem authority through `Reflect.set` to fail without changing the authority; and
- selected session state to remain immutable after a valid selection.

This is committed RED contract evidence. No hosted run is inferred from the test's presence.

## Chosen repair

Commit `580677af836251b62d1514024a15b8fa1527646a` centralizes immutable snapshot construction in `playbackSourceSession.ts`:

- each emitted `PlaybackSourceOption` is copied to a frozen scalar object and the option list itself is frozen;
- each issued discovery request is frozen;
- each newly emitted session snapshot is frozen and contains frozen options plus a frozen pending request when present; and
- create, refresh, completion and selection paths all emit through that boundary.

The stale-completion path continues to return the already-current session unchanged. Sessions produced by this API are already immutable, so stale receipt rejection does not manufacture another state transition merely to re-freeze the same current receipt.

A deep-freeze utility was rejected. The authority-bearing structures here contain only scalar values and one array of scalar option objects; a generic recursive freezer would widen scope and complexity without protecting additional admitted data.

## Focused verification

The exact production source at `580677af...` and its current `playbackSourceSelection.ts` dependency were compiled under TypeScript 5.8.3 with `--strict`. A focused runtime harness exercised initial/refresh/completion/selection freezing, attempted authority/session mutation with `Reflect.set`, and retained the hostile Proxy fail-closed path. The harness completed successfully.

This focused verification is not repository GREEN. PR-triggered GitHub Actions and the protected 14-context gate remain independently required on the unchanged exact head.

## Effect and remaining risk

The renderer can no longer rewrite an already-admitted source option, discovery request, selection, or session snapshot in place. State changes require a new value through the existing session transition functions, preserving canonical validation and stale-request checks.

The buyer-visible source-to-audible vertical is still incomplete. `RehearsalPlayer` must mount the native availability refresh, actual `Full mix | Vocals | Bass | Drums | Other instruments` selector and the stale-safe `beginPlaybackSourceSwitch → audio.src/load → loadedmetadata admission → seek/rate restore → conditional resume` transaction. Project rotation/revocation, persistence/reload, pointer/touch/keyboard/screen-reader behavior, eight-locale expansion and rights-cleared audible Windows/macOS evidence remain open.

## Delivery gate

**FAIL.** This immutable session-snapshot slice has focused compile/runtime evidence, but PR #1160 does not yet have complete exact-head protected CI/security/coverage/build/review evidence and the mounted buyer journey remains unfinished.
