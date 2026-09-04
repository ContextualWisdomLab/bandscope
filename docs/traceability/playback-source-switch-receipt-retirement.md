# Playback source-switch receipt retirement

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer media-source replacement
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `09bedd835475015379716292e63e6be376fceec9`
- **Stem publication parent:** PR #1159 `c27f3781ddcbcc013dce07a26c0baf6080e4b2ac`

## Problem

`PlaybackSourceSwitchSession` invalidates older `loadedmetadata` receipts when a newer source switch begins, and `admitPlaybackSourceSwitchTarget` admits only the exact current target, renderer sequence and decoded duration. Two terminal paths need explicit ownership: successful continuity restoration and failed target load/admission.

Without success retirement, an admitted `activePlan` remains stored after its authority has been consumed. Without failure retirement, a short/malformed target or media-load failure can leave the issued plan alive long enough for a later metadata event from the same mutable media element to satisfy admission and restore transport after the switch was already considered failed.

Neither case creates permission to read native bytes, but both unnecessarily extend renderer restoration authority. A mounted player must be able to terminate the exact issued receipt on either outcome without resetting sequence identity or allowing a copied/stale plan to affect a newer switch.

## Successful completion: test-first evidence

RED commit `a2222a42a175a1196c32544c6e7bd521992a42a4` adds `playbackSourceSwitchCompletion.test.ts` before a production completion transition exists. It requires:

- an admitted exact active receipt to retire to the same monotonic sequence with `activePlan: null`;
- the resulting session to remain frozen;
- a copied look-alike plan not to retire the issued active receipt; and
- a stale previously admitted receipt not to clear a newer active switch.

The predecessor production module had no `completePlaybackSourceSwitch` export, so this is a source-level RED contract rather than a claim of hosted execution.

GREEN source commit `73b0e47d112e5baa52e19ffb98640eda271df9af` adds `completePlaybackSourceSwitch`. It retires a receipt only when the caller supplies the exact object currently stored in `state.activePlan` and the sequence still matches. Success returns the existing frozen-session representation with the same sequence and `activePlan: null`; copied, stale, null or sequence-mismatched plans return the current session unchanged.

## Failed target: test-first evidence

RED commit `77a708e28b64a73abd5e49133cbdc59449c1f937` extends the same completion regression before a failure transition exists. A target whose decoded duration is shorter than the selected loop must fail admission, after which the exact issued plan must be retireable. A copied look-alike plan must not retire it, and an older failed plan must not clear a newer active switch.

Causal fix `ba06f0c0427a33f93a1e01b01e8043c983dc3679` adds `abortPlaybackSourceSwitch`. Successful completion and failure abort share one private exact-plan retirement primitive so the identity rule cannot drift between terminal paths. The public functions remain separate because their caller preconditions differ: `completePlaybackSourceSwitch` follows successful target admission and continuity restoration; `abortPlaybackSourceSwitch` follows failed loading or failed admission.

A focused TypeScript 5.8.3 `--strict` / Node 22.16.0 harness exercised the current production function against exact-plan failure retirement, copied-plan rejection, stale-plan rejection, and the existing successful completion path. It passed. This is focused causal GREEN only; it is not repository exact-head CI evidence.

## Authority and alternatives

The terminal helpers do not create playback authority, mutate native availability, reset renderer sequence identity, or infer filesystem identity. Exact issued-object identity remains the narrowest renderer-local cancellation/retirement token because these plans are not serialized across IPC.

Keeping failed or completed plans until the next selection was rejected because termination should occur at the outcome that consumes or rejects the receipt, not at an unrelated future action. Resetting the sequence was rejected because reuse weakens stale-event rejection. Structural equality was rejected because a reconstructed JavaScript object must not acquire the authority of the immutable plan stored by the current session. A second native receipt owner was rejected because `PlaybackAuthority` remains the sole owner of playable bytes.

## Remaining buyer gap

This closes the terminal receipt prerequisite, not the source selector. `RehearsalPlayer` still needs one mounted transaction owner that refreshes native availability, displays only the current `Full mix | Vocals | Bass | Drums | Other instruments` options, calls `beginPlaybackSourceSwitch` before changing `audio.src`, and then follows exactly one terminal path:

- successful load: exact target/sequence/duration admission → restore seek/playback rate/resume intent → `completePlaybackSourceSwitch`;
- failed load/admission: keep transport non-playing → `abortPlaybackSourceSwitch` before any later media event can reuse the failed receipt.

Project rotation, native revocation, persistence/reload, pointer/touch/keyboard/screen-reader behavior, JA/ZH/VI/ES/DE/FR plus CJK/text-expansion/font-fallback evidence, and rights-cleared Windows/macOS audible acceptance remain open. Source-level RED→fix and focused verification are not substitutes for protected exact-head CI, security, coverage, build, review or release gates.
