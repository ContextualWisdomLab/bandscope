# Playback source-switch receipt retirement

- **Status:** Draft implementation evidence; not shipped or release acceptance
- **Date:** 2026-09-05
- **Bounded context:** Active Player / renderer media-source replacement
- **Protected product source:** `develop@314ddeae7b775a4957594b599358c8255617eb2e`
- **Canonical Active Player owner:** PR #971 `09bedd835475015379716292e63e6be376fceec9`
- **Stem publication parent:** PR #1159 `c27f3781ddcbcc013dce07a26c0baf6080e4b2ac`

## Problem

`PlaybackSourceSwitchSession` already invalidates older `loadedmetadata` receipts when a newer source switch begins, and `admitPlaybackSourceSwitchTarget` admits only the exact current target, renderer sequence and decoded duration. The lifecycle still lacked one explicit terminal transition: after a target receipt is admitted and transport continuity is restored, the admitted `activePlan` remained stored in the session.

Leaving a completed receipt active is not itself permission to read native bytes, but it unnecessarily extends restoration authority across later media-element events. A repeated `loadedmetadata` event for the same target/sequence could remain admissible, and a future mounted player would have to mutate or replace renderer session state ad hoc to retire the receipt. That is incompatible with the single-writer, immutable-receipt boundary already established for source switching.

## Test-first evidence

RED commit `a2222a42a175a1196c32544c6e7bd521992a42a4` adds `playbackSourceSwitchCompletion.test.ts` before a production completion transition exists. It requires:

- an admitted exact active receipt to retire to the same monotonic sequence with `activePlan: null`;
- the resulting session to remain frozen;
- a copied look-alike plan not to retire the issued active receipt; and
- a stale previously admitted receipt not to clear a newer active switch.

The predecessor production module had no `completePlaybackSourceSwitch` export, so this is a source-level RED contract rather than a claim of hosted execution.

## Causal fix

GREEN source commit `73b0e47d112e5baa52e19ffb98640eda271df9af` adds `completePlaybackSourceSwitch`. It retires a receipt only when the caller supplies the exact object currently stored in `state.activePlan` and the sequence still matches. Success returns the existing frozen-session representation with the same sequence and `activePlan: null`; copied, stale, null or sequence-mismatched plans return the current session unchanged.

The helper does not create playback authority, mutate native availability, reset the sequence, or infer filesystem identity. It is intentionally narrower than a general state setter. The caller must first pass target metadata through `admitPlaybackSourceSwitchTarget`; premature retirement can only remove restoration authority and therefore fails safe rather than granting playback authority.

## Alternatives considered

Keeping the active plan until the next switch was rejected because completion should terminate authority as soon as it is consumed, not at some unrelated future selection. Resetting the renderer sequence to zero was rejected because sequence reuse would weaken stale-receipt rejection. Allowing structural equality was rejected for the same reason as discovery-receipt impersonation: a copied JavaScript object must not acquire the authority of the exact immutable receipt issued by the current session.

## Remaining buyer gap

This closes a lifecycle prerequisite, not the source selector. `RehearsalPlayer` still needs one mounted transaction owner that refreshes native availability, displays only the current `Full mix | Vocals | Bass | Drums | Other instruments` options, calls `beginPlaybackSourceSwitch` before changing `audio.src`, admits the exact target/sequence/duration on `loadedmetadata`, restores seek/playback rate/resume intent, then immediately retires that admitted plan with `completePlaybackSourceSwitch`.

Project rotation, native revocation, malformed or short target media, persistence/reload, pointer/touch/keyboard/screen-reader behavior, JA/ZH/VI/ES/DE/FR plus CJK/text-expansion/font-fallback evidence, and rights-cleared Windows/macOS audible acceptance remain open. Source-level RED→fix evidence is not a substitute for the protected exact-head CI, security, coverage, build, review or release gates.
