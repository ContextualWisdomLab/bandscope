# Playback source discovery fallback-state traceability

Status: Draft source/test evidence for PR #1160. This document does not promote the Active Player stack to shipped or release-ready state.

## Problem

The mounted source selector already represented a pending native availability lookup, but after that lookup settled it collapsed two materially different outcomes into the same silent UI:

- native authority verified that only Full mix is currently available; and
- native discovery failed or returned a malformed/partial authority set that the renderer rejected.

Both states removed the stem selector. A musician could not tell whether stems simply did not exist for the project or BandScope had failed to verify them, and a transient discovery failure offered no explicit retry path. This violated the material-UI requirement for distinct loading, empty, and error behavior while obscuring buyer truth.

## Constraints and authority

The repair must not create a second playback registry or transport store. `PlaybackAuthority` remains the native owner of playable bytes, `get_playback_source_availability` remains the native read model, `PlaybackSourceSession` remains the renderer option/session authority, and `RehearsalPlayerCore` remains the transport owner.

Renderer feedback is presentation state only. It is bound to the exact mounted full-mix authority and current discovery generation. It cannot mint authority, infer paths, keep a revoked stem selectable, or persist into `.bscope` project data. Native error details are intentionally not surfaced because they may contain path or process information that does not belong in buyer-visible UI.

## Test-first evidence

RED commit `298c76bee887709fe536c2abfcb15b33bca3ba18` adds mounted regressions requiring:

- a verified Full-mix-only response to announce `No stem sources are available for this project. Full mix is ready.` with `role="status"` and explicit `aria-atomic="true"`, without rendering a stem group;
- a native discovery rejection to announce `Could not check stem sources. Full mix is still available.`, keep Full mix usable, and expose a keyboard-operable `Check stem sources again` button;
- retry to issue a fresh native discovery and replace the error state with the canonical stem group only after a complete valid response.

The predecessor UI could not satisfy these assertions because `discoverPlaybackSourceOptions` returned `null` both for failures and rejected payloads while a legitimate `[fullMix]` result simply produced no selector and no post-settlement status.

## Minimal causal repair

Commit `d2a2d5f58ce407ef5472fe14922a40d4a6ec084a` adds a discriminated discovery result without changing the native command or the existing compatibility API:

- `ready` — a canonical complete five-source option set;
- `empty` — a verified Full-mix-only option set;
- `error` — invalid current authority, native invocation failure, or malformed/partial/stale response.

`discoverPlaybackSourceOptions` remains available and delegates to the new outcome function, so existing consumers retain their options-or-null contract.

EN resource commit `4599cfaa2c78ba9d7db023f1f50210715fbdd2a6` and KO resource commit `cf29ef07a82bb611517f1f3c2ac27de0ed98f578` add only the new empty/error/retry copy under the existing locale owner. Copy is never used as source identity.

Mounted implementation commit `0b4d1383418763f91978a41c35081ce39ca68788` binds fallback feedback to the exact `fullMixAuthority`, clears it synchronously when a new discovery begins, and commits it only after the existing generation check accepts the current async result. Project rotation or a newer refresh therefore hides stale feedback just as it hides stale stem options. Error retry reuses the same `beginPlaybackSourceDiscovery` receipt path instead of bypassing session authority.

Commit `447e8a48343c9addbffaf4e4499305c51e610ff4` pins the new discovery-result classification at the unit boundary, including proof that an invocation error containing a private-looking native path is reduced to `{ status: "error", options: null }` rather than echoed to the renderer.

KO interaction evidence was added in `856d37f493febffc15244e46dc38b832c12d5cca`. Review immediately found that the pre-existing locale fixture used `bandscope-project://project-i18n-1`, which is not a canonical playback authority because `PlaybackSourceSelection` requires numeric project identity segments. Repair `442b87f37ec415a972f78dd7359853d63689e9c6` changes the fixture to `bandscope-project://project-400-4`, so the locale test now exercises the real authority grammar instead of relying on an impossible test token. The Korean empty state and retry action remain covered without changing production authority rules.

## Accessibility and interaction decision

The empty and error messages use `role="status"` because they are advisory changes to the current rehearsal surface and do not justify an interruptive alert or focus transfer. Explicit `aria-atomic="true"` is retained for compatibility. The retry control is a native `button` adjacent to, not nested inside, the live region; it remains in normal focus order and uses the existing visible focus treatment and minimum interactive height.

This follows WCAG 2.2 Success Criterion 4.1.3 and WAI-ARIA 1.2 status semantics. W3C's ARIA22 technique also recommends explicit `aria-atomic="true"` because some environments do not consistently apply the implicit atomic behavior.

## Rejected alternatives

Treating `empty` and `error` as one state was rejected because a legitimate absence of generated stems and inability to verify native availability imply different buyer actions. Showing raw native exception text was rejected because it can expose local path/process details and does not improve rehearsal recovery. Automatic polling was rejected because it creates repeated hidden refresh work and selector churn; retry is explicit and bounded. An `alert` was rejected because Full mix remains usable and the condition does not require immediate interruption. Persisting the failure or retry state was rejected because it is volatile UI feedback, not project truth.

## Risks and remaining work

This slice is source/test evidence until exact-head hosted component/browser checks finish. It does not establish actual screen-reader behavior on packaged Windows/macOS builds. JA/ZH/VI/ES/DE/FR, CJK/text expansion/font fallback, the DB-backed/versioned translation ledger, selected-source persistence/reload through #970/#962, rights-cleared audible desktop acceptance, and wider responsive/browser evidence remain open owners/gaps.

A malformed/partial native response is intentionally classified as `error`, not `empty`, because the renderer cannot prove that the absence of selectable stems is authoritative in that case. Full mix remains the fail-closed playback source.

## References

World Wide Web Consortium. (2023, October 5). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/

World Wide Web Consortium. (2023, June 6). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria-1.2/

World Wide Web Consortium. (n.d.). *ARIA22: Using role=status to present status messages*. Retrieved September 5, 2026, from https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22
