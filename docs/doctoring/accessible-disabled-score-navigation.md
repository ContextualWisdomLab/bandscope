# Accessible disabled score actions

## Scope

BandScope keeps selected score actions discoverable when they are unavailable by using `aria-disabled="true"` plus guarded click handlers instead of native `disabled`. The contract covers the Add score control when no active project exists, existing-score Open/Remove controls without an active project, and score-viewer Previous/Next page controls at pagination boundaries.

For project-bound actions, the visible localized project requirement is associated programmatically through `aria-describedby`; Add/Open/Remove therefore expose the same recovery information to assistive technology while remaining keyboard-focusable. For pagination boundaries, the localized first/last-page reason is rendered as persistent screen-reader-only text associated through `aria-describedby` with a renderer-owned `useId()` target. The visible hover/focus explanation uses the shared Base UI-backed `Tooltip` component instead of maintaining a second Score-specific tooltip state machine. This keeps the assistive description stable when the visual tooltip is dismissed with `Escape` and delegates hover/focus persistence, portal positioning, pointer interaction and dismissal semantics to the reusable UI primitive. Native `title` is not used for icon-only page or zoom controls, avoiding a competing description channel and a keyboard/touch-only dependency.

The Add score control is also action-guarded while an attachment operation is already pending. It remains rendered and exposes `aria-disabled="true"`, while the click boundary rejects duplicate activation so one in-flight attach cannot start a second native picker/storage mutation.

This document records the accessibility rationale for PR #731 only. It does not claim that keeping every disabled control focusable is universally preferable, and it does not convert source-level behavior into a WCAG conformance claim without current-head browser and assistive-technology evidence.

## Contract

- Add/Open/Remove score actions remain keyboard-focusable when no active project exists, so their presence and unavailable state can be discovered.
- `aria-disabled` communicates that an action is currently not operable; the guarded click handler remains the actual fail-closed action boundary.
- Project-bound unavailable actions use `aria-describedby` to point to the visible localized project requirement rather than duplicating hidden recovery copy.
- The Add score action also blocks repeated activation while an attach is already pending; no second bridge request is issued from the guarded branch.
- A boundary page-navigation button remains keyboard-focusable so its presence and unavailable state can be discovered.
- Boundary `aria-describedby` points to persistent localized screen-reader-only reason text for as long as that exact navigation action is unavailable.
- EN boundary copy states the actual reason: `Already at the first page` / `Already at the last page`. KO uses `첫 번째 페이지입니다` / `마지막 페이지입니다`.
- Zoom and pagination icon buttons use the shared `Tooltip` / `TooltipTrigger` / `TooltipContent` primitive. Enabled pagination tooltips carry the action label; unavailable pagination tooltips combine the action and reason.
- The shared tooltip appears on pointer hover or keyboard focus and is dismissible with `Escape`; dismissing visual hover/focus content does not remove the persistent `aria-describedby` recovery reason.
- Boundary activation is guarded in application code. Clicking an `aria-disabled` page action does not navigate even though the control remains focusable.
- Description IDs are renderer-owned and generated with React `useId()`; analysis or file metadata never becomes DOM-ID authority.

## Verification

`apps/desktop/src/features/score/ScoreView.disabled-action-accessibility.test.tsx` verifies that Add/Open/Remove controls without an active project remain focusable, carry `aria-disabled`, resolve `aria-describedby` to the visible localized project requirement, expose recovery titles, and reject activation without invoking the desktop bridge.

`apps/desktop/src/features/score/ScoreView.test.tsx` independently verifies the project-missing guarded branches and the in-flight Add score branch: a repeated click while the first attach promise is pending is prevented and does not issue a second attach request.

`apps/desktop/src/features/score/ScoreViewer.disabled-navigation-accessibility.test.tsx` verifies the reusable-tooltip contract on a three-page document. At page 1, Previous remains focusable and `aria-disabled`, its persistent `aria-describedby` target contains the first-page reason, keyboard focus opens shared tooltip content that combines action and reason, `Escape` dismisses only the visual tooltip, and boundary activation remains inert. The same test verifies an enabled Next tooltip and then the persistent last-page reason after navigation reaches page 3.

The current reusable-component repair is test-first:

- RED `e89ba127b18ad9f372ce6796573df36cb372f561` requires the boundary reason to remain available to assistive technology while visible hover/focus content is supplied by the shared tooltip and can be independently dismissed.
- Fix `c26fbe4269ca46d9c56db02a30b259ec653e5289` removes the Score-specific tooltip state machine and manual hover geometry, keeps persistent `aria-describedby` reason nodes, and moves zoom/page icon hover/focus content onto the shared Base UI-backed tooltip primitive.

The earlier WCAG 1.4.13 repair lineage remains useful evidence for the interaction requirements that motivated this consolidation:

- `8e0012d46cc0603a836119e47cc191f462c7dc1b` → `78a5e60a1de7a259c45798959ca497456994fb2f` established pointer access to author-controlled boundary content.
- `b13c3859712f94cb66bbbbe24440f7682b3c47e7` → `1a92b71f168a6bec64ad75de2f64f3a6fef4afa5` established Escape dismissal.
- `a150059cf73540078741fbc8e15ab11f65a0893c` → `a941cf176d15d98ed2f31751a61dcb798eb36daa` removed invisible pointer interception and hover dead-zone geometry.

Those predecessor mechanics are no longer duplicated in `ScoreViewer`; the shared tooltip component now owns visual tooltip behavior while ScoreViewer owns only the pagination availability/reason semantics.

## Standards and guidance boundary

WAI-ARIA 1.2 defines `aria-disabled` as conveying a perceivable but disabled state; application code still owns suppression of behavior. WCAG 2.2 Success Criterion 1.4.13 requires author-controlled content triggered by hover or focus to be dismissible when applicable, hoverable when pointer hover triggers it, and persistent while the trigger remains valid. The WAI-ARIA Authoring Practices keyboard guidance explains why focusable disabled controls can be appropriate when discoverability matters, but this remains a design trade-off rather than a universal rule. WCAG Technique ARIA1 documents `aria-describedby` as a mechanism for associating descriptive information with a user-interface control through an in-document ID reference.

These references define acceptance semantics for the source and browser tests; they do not by themselves establish WCAG conformance, screen-reader interoperability, or certification.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. WAI-ARIA Authoring Practices Guide. Retrieved September 6, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls*. Techniques for WCAG 2.2. Retrieved September 6, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA1
