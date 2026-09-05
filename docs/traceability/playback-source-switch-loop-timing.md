# Playback source switch loop-timing admission

## Problem

`PlaybackSourceSwitchPlan` is renderer-local restoration authority for one mutable HTML media-source replacement. Before this repair, `capturePlaybackSourceSwitch` validated the current seek position but assumed `transport.loop.startSeconds` and `transport.loop.endSeconds` were already finite and ordered.

That assumption was unsafe at the authority boundary. In JavaScript, comparisons against `NaN` are false, so a looping or paused transport with a `NaN` loop boundary could pass the seek comparisons and mint a frozen restoration plan carrying invalid timing. Target-duration admission could then also miss a `NaN` end boundary because `NaN > duration` is false.

## Constraint

Do not clamp malformed timing, synthesize a replacement loop, or create a second transport owner. The switch helper must consume the existing Active Player transport snapshot and either preserve its exact admitted timing or issue no restoration authority.

## Test-first evidence

- RED contract: `7463e3e600dcedeb07748354e601db90ce191ada` adds malformed-loop cases covering `NaN`, negative infinity, negative start, equal bounds, and reversed bounds.
- Causal fix: `836f159d4dbef5556651fb329c58a98203274a5f` requires finite start/end, `startSeconds >= 0`, and `endSeconds > startSeconds` before a source-switch plan can be issued.

The pre-existing out-of-loop media-time, same-project authority, sequence, decoded-duration, stale-receipt, exact-object, retirement, and sequence-exhaustion contracts remain unchanged.

## Alternatives rejected

- **Clamp to zero or target duration:** rejected because it changes rehearsal timing authority and can move a player to a position the room did not select.
- **Rely on upstream transport construction only:** rejected because this function mints a later media-restoration receipt and therefore must fail closed on the values it embeds.
- **Validate only during `loadedmetadata`:** rejected because invalid timing should never become an issued restoration receipt.

## Effect and remaining work

Malformed loop timing can no longer become `PlaybackSourceSwitchPlan` authority. This does not complete source switching: the mounted `RehearsalPlayerCore` still needs to bind `beginPlaybackSourceSwitch` before `audio.src` mutation, admit exact target metadata, restore seek/rate, resume only captured looping state, and retire or abort the receipt on every terminal path.

Repository/central exact-head CI, native Windows/macOS build evidence, independent last-push review, persistence/reload, mounted revocation, wider locale coverage, and rights-cleared audible acceptance remain separate gates.
