# Mounted playback-source switch transaction traceability

Status: Draft implementation evidence for PR #1160. This is not release-readiness or exact-head protected-CI evidence.

## Problem

The mounted source selector could choose an atomically admitted stem, and `playbackSourceSwitch.ts` already defined a renderer-local continuity receipt. The actual `<audio>` lifecycle in `RehearsalPlayerCore`, however, still bypassed that receipt: a selected authority change made playback intent inactive, cleared admitted duration, paused, replaced `audio.src`, and called `load()`, while a generic metadata handler admitted any finite positive duration. Because the looping effects also observed the changed source URL, they could attempt playback before the target source had been admitted.

The media mutation therefore needed one transport-owned transaction without introducing another native playback authority, transport store, filesystem path, or cross-bounded-context source registry.

## Constraints and owner boundary

- Native `PlaybackAuthority` remains the sole owner of playable bytes and opaque source handles.
- `PlaybackSourceSession` remains the renderer option-selection authority; the core receives one selected opaque authority.
- `PlaybackSourceSwitchSession` remains renderer-local. It does not cross IPC and does not mint native authority.
- The switch receipt must be issued before `audio.src` changes, must be exact-object/sequence/target/duration admitted, and must be single-use.
- Count-in and paused-count-in continuity remain fail-closed under the existing source-switch contract.
- Project rotation or otherwise non-continuable source replacement may load safely, but must not inherit transport continuity from a different project.

## Test-first contract

Commit `6e99b7c360cb09a1e624a2035c33d2444b23693c` establishes the mounted regression with the real demo loop boundary (10–30 s at 120 BPM). While the transport is looping at 17.5 s, choosing `Vocals` must call `load()` but must not call `play()` until target metadata is admitted; a 120 s target must then restore 17.5 s and resume playback.

An earlier test-only commit used 2.5 s, which is outside the demo loop, and was corrected before the production implementation. It is not used as behavioral evidence. No pull-request workflow run materialized on the intermediate RED head, so this lineage is source-level test-first evidence rather than a hosted RED receipt.

## Minimal causal implementation

Commit `eba21f5b298c4bc7f4f6cc4fcd6b5fcb4c735b31` binds the existing source-switch contract to `RehearsalPlayerCore`:

1. the core remembers only the last admitted opaque playback authority;
2. when the selected authority changes within that project, it calls `beginPlaybackSourceSwitch` before mutating `audio.src`;
3. it marks the media transaction pending, makes playback intent inactive, clears admitted duration, pauses, replaces the source, and calls `load()`;
4. pending state prevents the looping/playback effects and Start/Pause/Stop/Seek controls from changing media transport during admission;
5. the effect-local `loadedmetadata` listener admits only the exact active session/plan, target authority, decoded duration, loop coverage, and seek position;
6. admitted metadata restores exact seek and playback rate, updates the looping playhead, completes the receipt, and only then allows the pre-existing looping effect to resume;
7. load or admission failure aborts the exact receipt, clears admitted source identity/duration, and leaves playback non-playing.

The implementation does not copy `PlaybackAuthority`, add a native nonce registry, expose a path, or create a second rehearsal transport aggregate.

## Failure and receipt-reuse regressions

Commit `a3ef7f1d164e3177d17a256e161db00ccfc7ac17` adds a mounted failure contract: a target with 20 s duration cannot cover the active 10–30 s loop, so it must not resume, must surface the existing local-audio error, and a later metadata event must not reuse the aborted restore receipt.

Review of the first implementation found a narrower lifecycle defect. After successful `completePlaybackSourceSwitch`, the effect-local `loadedmetadata` listener remained attached. A repeated metadata event could re-enter with the consumed plan, fail exact active-plan admission, and incorrectly revoke the already admitted source. Commit `70bb51bdc109ddb559f76523661293062f789b84` adds the regression requiring a second metadata event after success to be inert: no second resume and no false playback error.

Commit `772f9dacb803fb9c2995d6d9a36dfb50c405b062` adds one effect-local `admissionSettled` guard. Initial admission, successful switch completion, and failed retirement settle the source mutation exactly once. Later metadata cannot reacquire or revoke consumed restoration authority. A genuine media `error` after admission still goes through the normal playback-error path; the guard suppresses only duplicate admission processing.

## Project-rotation finding and repair

A second fresh review found that the pending gate in the first mounted implementation was intentionally tied to a valid continuity plan. That is correct for same-project stem continuity but insufficient for a full-mix project/generation rotation: `beginPlaybackSourceSwitch` correctly refuses cross-project continuity, so `plan === null`; the old core could then retain a `looping` transport long enough for its source-URL effect to observe the new URL and call `play()` before the new project metadata had been admitted.

Test-first commit `a2de609d4f5b10120b51582da2aeff03f10a1beb` requires project authority rotation to replace the mounted core/media element, perform the new target load, and remain non-playing both before and after target metadata admission. This makes the ownership decision explicit: same-project stem selection may preserve transport continuity, but a new full-mix authority is a new project/generation transport boundary.

Causal fix `0b01c3e72a948a2f07992d946ccd2ecfa94be0c2` keys `RehearsalPlayerCore` by the mounted full-mix authority supplied by the parent, not by the currently selected stem. Stem changes inside one project therefore keep the same core and use the continuity receipt; project/generation rotation remounts the transport and its renderer-local switch session instead of inheriting phase or receipts from the prior authority. No native owner, path, database record, or cross-project continuity rule is added.

## Rejected alternatives

Keeping the direct source-change effect and merely delaying `play()` was rejected because metadata would still have no exact receipt identity. Clamping seek or loop boundaries to a short target was rejected because it would silently rewrite rehearsal truth. Creating a second native playback-generation or authority registry was rejected because native `PlaybackAuthority` already owns playable bytes. Forcing the logical transport into `paused` during same-project loading was rejected because that would mutate rehearsal phase semantics solely to accommodate a media-element transaction; pending admission instead gates media actions while preserving the captured transport state. Allowing cross-project continuity with another receipt was rejected because a project/generation rotation must not inherit renderer transport state from the previous playback authority.

## Verification boundary

The new mounted regressions are committed, and the production delta is bounded to the existing Active Player media owner, its public composition wrapper and the new test. At the time of this traceability update, no pull-request-triggered hosted workflow receipt has materialized for this source-switch lineage. Therefore neither the REDs nor the current implementation are claimed as repository exact-head GREEN until protected CI runs on one unchanged final head.

## Remaining buyer gaps

The media transaction closes the direct selector-to-`<audio>` continuity gap and project rotation no longer inherits the previous transport. Commercial delivery remains incomplete. Selected-source persistence/reload, mounted native revocation behavior, translation-ledger integration for source labels, JA/ZH/VI/ES/DE/FR plus CJK/text-expansion/font-fallback evidence, responsive/browser and screen-reader E2E, and rights-cleared audible Windows/macOS acceptance are still required. Current protected CI, security, build, coverage, review, signing/notarization, SBOM/provenance, updater/rollback, and immutable release evidence must also pass on one exact release head.

UI Delivery Gate: **FAIL** until those remaining interaction, locale, desktop real-audio, and exact-head protected-gate requirements are satisfied.
