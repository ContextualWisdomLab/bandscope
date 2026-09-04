# Playback source-switch receipt retirement

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer media-source replacement
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `09bedd835475015379716292e63e6be376fceec9`
- **Stem publication parent:** PR #1159 `c27f3781ddcbcc013dce07a26c0baf6080e4b2ac`

## Problem

`PlaybackSourceSwitchSession` invalidates older `loadedmetadata` receipts when a newer source switch begins. The renderer must also bind metadata admission and both terminal outcomes to the exact issued active plan rather than accepting a structurally equal JavaScript object.

Without success retirement, an admitted `activePlan` remains stored after its authority has been consumed. Without failure retirement, a short/malformed target or media-load failure can leave the issued plan alive long enough for a later metadata event from the same mutable media element to satisfy admission and restore transport after the switch was already considered failed. Before the admission-identity repair below, `admitPlaybackSourceSwitchTarget` still accepted a copied frozen plan when its target, sequence and duration scalars matched, even though completion/abort correctly rejected that copied object.

Neither case creates permission to read native bytes, but both unnecessarily extend or counterfeit renderer restoration authority. A mounted player must be able to admit and terminate only the exact issued receipt on either outcome without resetting sequence identity or allowing a copied/stale plan to affect a newer switch.

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

A focused TypeScript 5.8.3 `--strict` / Node 22.16.0 harness exercised the then-current production function against exact-plan failure retirement, copied-plan rejection, stale-plan rejection, and the existing successful completion path. It passed. This is historical focused causal GREEN only; it is not evidence for the newer exact head.

## Admission identity repair

RED commit `772810f36c7f37ebc0fb2c3614d4744d88c4cec7` adds a regression proving the asymmetry that remained after retirement was hardened: `Object.freeze({ ...issuedPlan })` had the same scalar target/sequence/loop values and was accepted by `admitPlaybackSourceSwitchTarget`, even though that object was never the `activePlan` stored by the current switch session.

Causal fix `06548e160b46092dd7b57dd637f046792dbff9ed` changes target admission to take the current `PlaybackSourceSwitchSession` and requires both `state.activePlan === plan` and `state.sequence === plan.sequence` before any duration/target restoration check. The redundant caller-supplied sequence argument is removed; the session is the renderer authority for current switch identity. Follow-up test-contract commits `d9ebc135dbfc64306afa7e909af0e370b466db3e`, `25926525f3783cf96a1e7461fcffbc68a6289efd`, and `a998f69e5e86ffc406235a8f2e541c8a9443fb25` update continuity, terminal lifecycle, and immutability call sites to the same exact-session admission contract.

The chosen repair is intentionally narrower than adding a new nonce, global registry, or native receipt. The plan and session never cross IPC, and the native `PlaybackAuthority` already owns playable-byte authority. Exact renderer object identity is sufficient for the restoration receipt while target authority, same-project validation, monotonic sequence and decoded-duration coverage remain independent checks.

## Authority and alternatives

The switch helpers do not create playback authority, mutate native availability, reset renderer sequence identity, or infer filesystem identity. Exact issued-object identity remains the narrowest renderer-local admission/cancellation/retirement token because these plans are not serialized across IPC.

Keeping failed or completed plans until the next selection was rejected because termination should occur at the outcome that consumes or rejects the receipt, not at an unrelated future action. Resetting the sequence was rejected because reuse weakens stale-event rejection. Structural equality was rejected because a reconstructed JavaScript object must not acquire the authority of the immutable plan stored by the current session. A second native receipt owner was rejected because `PlaybackAuthority` remains the sole owner of playable bytes. A module-global registry was also rejected because the current session already contains the exact active plan and is easier to reason about, test, and discard on project rotation.

## Remaining buyer gap

This closes the admission/terminal receipt prerequisite, not the source selector. `RehearsalPlayer` still needs one mounted transaction owner that refreshes native availability, displays only the current `Full mix | Vocals | Bass | Drums | Other instruments` options, calls `beginPlaybackSourceSwitch` before changing `audio.src`, and then follows exactly one terminal path:

- successful load: exact active-session/plan target/duration admission → restore seek/playback rate/resume intent → `completePlaybackSourceSwitch`;
- failed load/admission: keep transport non-playing → `abortPlaybackSourceSwitch` before any later media event can reuse the failed receipt.

Project rotation, native revocation, persistence/reload, pointer/touch/keyboard/screen-reader behavior, JA/ZH/VI/ES/DE/FR plus CJK/text-expansion/font-fallback evidence, and rights-cleared Windows/macOS audible acceptance remain open. The new exact head still requires protected CI, security, coverage, native build and independent review evidence before any Ready/merge or release claim.