# Playback source discovery receipt identity

## Problem

`PlaybackSourceSession` issues one renderer-local `PlaybackSourceDiscoveryRequest` when a native playback-source refresh begins. Before this repair, `completePlaybackSourceDiscovery` accepted any object whose `fullMixAuthority` and `sequence` scalar values matched the pending request. Code running in the renderer could therefore reconstruct a look-alike receipt and submit a discovery payload that had not been paired with the exact request object issued by the current session.

The scalar comparison still rejected ordinary stale project and sequence results, but it did not preserve the stronger invariant established by the immutable receipt work: only the exact frozen receipt created by the current transition may complete that transition.

## Constraints

- Native `PlaybackAuthority` remains the only owner of filesystem identity and playable bytes.
- The renderer must not mint playback authority or infer a native path from a receipt.
- Discovery request identities remain renderer-local and are not serialized through IPC; native discovery receives only the already-owned full-mix authority.
- Sequence values remain monotonic and non-reused, and project rotation continues to invalidate older discovery work.
- Malformed or hostile native responses still fail closed to full-mix-only state.

## Test-first evidence

RED commit `616cae06745b24ea2d947cba724135b1568ea0dc` adds a regression that begins a valid discovery, reconstructs a distinct request object with the same authority and sequence, and attempts to complete the refresh with an otherwise canonical five-source payload. The expected result is the unchanged pending session. The predecessor production implementation compared scalar fields only and therefore admitted the forged receipt.

GREEN commit `c51437976fb2daa134000393d3ef70d8c07d8a92` adds object-identity admission (`state.pendingRequest === request`) before the existing scalar/project checks. `beginPlaybackSourceDiscovery` stores and returns the same frozen request object, so legitimate async completion keeps working without a compatibility alias or second receipt format.

## Alternatives considered

Using only the monotonic sequence was rejected because a renderer-local caller can copy the current sequence. Adding a random nonce was also rejected: the request never crosses a process boundary, so the already-issued frozen object is the narrower authority token and avoids a second identity mechanism. Moving discovery receipts into native state was rejected because it would duplicate renderer lifecycle ownership and expand the IPC contract without solving a native authority problem.

## Effect and remaining risk

A look-alike object can no longer complete the current renderer discovery transition even when every scalar field matches. Older requests, cross-project requests, malformed options, throwing getters/proxies, sequence exhaustion and in-place receipt mutation remain covered by the surrounding session contracts.

This repair does not make stems buyer-visible. `RehearsalPlayer` still needs to mount the session, refresh native availability, render the actual source selector and execute source changes through `PlaybackSourceSwitchSession` before mutating `audio.src`. Exact target/sequence/duration admission, transport restoration, project rotation/revocation, persistence/reload, keyboard/pointer/touch/screen-reader behavior, eight-locale evidence and rights-cleared Windows/macOS audible acceptance remain open.
