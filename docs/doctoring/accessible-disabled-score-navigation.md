# Accessible disabled score actions

## Scope

BandScope keeps selected score actions discoverable when they are unavailable by using `aria-disabled="true"` plus guarded click handlers instead of native `disabled`. The contract covers the Add score control when no active project exists, existing-score Open/Remove controls without an active project, and score-viewer Previous/Next page controls at pagination boundaries.

For project-bound actions, the visible localized project requirement is associated programmatically through `aria-describedby`; Add/Open/Remove therefore expose the same recovery information to assistive technology while remaining keyboard-focusable. For pagination boundaries, the localized first/last-page reason is rendered as an in-document `role="tooltip"` associated through `aria-describedby` with a renderer-owned `useId()` target. The tooltip becomes visually available on pointer hover or keyboard focus. Its hidden state does not intercept pointer input; once hover/focus reveals it, pointer hit testing is enabled and the popup is adjacent to the owning control so the pointer can move continuously onto the explanation without crossing a dead gap. `Escape` dismisses the tooltip and its description reference without moving pointer hover or keyboard focus. Re-entering the control with the pointer or returning keyboard focus makes the currently valid boundary reason available again. Native `title` is not used as the unavailable-state explanation, avoiding a second competing description channel and a keyboard/touch-only gap.

The Add score control is also action-guarded while an attachment operation is already pending. It remains rendered and exposes `aria-disabled="true"`, while the click boundary rejects duplicate activation so one in-flight attach cannot start a second native picker/storage mutation.

This document records the accessibility rationale for PR #731 only. It does not claim that keeping every disabled control focusable is universally preferable, and it does not convert source-level behavior into a WCAG conformance claim without current-head browser and assistive-technology evidence.

## Contract

- Add/Open/Remove score actions remain keyboard-focusable when no active project exists, so their presence and unavailable state can be discovered.
- `aria-disabled` communicates that an action is currently not operable; the guarded click handler remains the actual fail-closed action boundary.
- Project-bound unavailable actions use `aria-describedby` to point to the visible localized project requirement rather than duplicating hidden recovery copy.
- The Add score action also blocks repeated activation while an attach is already pending; no second bridge request is issued from the guarded branch.
- A boundary page-navigation button remains keyboard-focusable so its presence and unavailable state can be discovered.
- Boundary `aria-describedby` points to a localized `role="tooltip"` explanation only while that exact navigation action is unavailable and the explanation has not been dismissed.
- EN boundary copy states the actual reason: `Already at the first page` / `Already at the last page`. KO uses `첫 번째 페이지입니다` / `마지막 페이지입니다`.
- Pointer hover and keyboard focus reveal the unavailable pagination explanation. Hidden tooltip content starts with `pointer-events-none`; `group-hover`/`group-focus-within` switch it to pointer-active at the same time it becomes visible, so an invisible popup cannot steal input.
- The popup is positioned directly against the control's hover geometry rather than across a margin gap, allowing the pointer to move from the control onto the explanation while the parent hover state remains active.
- Pressing `Escape` removes the author-controlled tooltip and `aria-describedby` reference while focus/hover can remain in place. A later pointer re-entry or keyboard refocus restores the currently valid explanation.
- Enabled pagination controls may keep their ordinary action title but do not retain stale disabled-state descriptions or tooltips.
- Description IDs are renderer-owned and generated with React `useId()`; analysis or file metadata never becomes DOM-ID authority.

## Verification

`apps/desktop/src/features/score/ScoreView.disabled-action-accessibility.test.tsx` verifies that Add/Open/Remove controls without an active project remain focusable, carry `aria-disabled`, resolve `aria-describedby` to the visible localized project requirement, expose recovery titles, and reject activation without invoking the desktop bridge.

`apps/desktop/src/features/score/ScoreView.test.tsx` independently verifies the project-missing guarded branches and the in-flight Add score branch: a repeated click while the first attach promise is pending is prevented and does not issue a second attach request.

`apps/desktop/src/features/score/ScoreViewer.disabled-navigation-accessibility.test.tsx` verifies both ends of a three-page document. The unavailable Previous action on page 1 and unavailable Next action on page 3 each resolve `aria-describedby` to the reason-specific localized `role="tooltip"`, omit a competing unavailable-state native title, remain focusable, expose focus/hover visibility classes, and require state-dependent pointer hit testing with no margin dead gap. The page-1 contract also presses `Escape`, requires the tooltip and description reference to disappear without navigation, then re-focuses the same control and requires the valid reason to return.

The RED→fix evidence for the WCAG 1.4.13 repairs is intentionally split:

- `8e0012d46cc0603a836119e47cc191f462c7dc1b` first required pointer access to the boundary tooltip before `78a5e60a1de7a259c45798959ca497456994fb2f` removed unconditional pointer suppression.
- `b13c3859712f94cb66bbbbe24440f7682b3c47e7` required Escape dismissal before `1a92b71f168a6bec64ad75de2f64f3a6fef4afa5` added dismiss-and-retrigger behavior.
- A further geometry/input review found that unconditional pointer hit testing makes the invisible tooltip an input target and that a visual margin can create a hover dead zone. RED `a150059cf73540078741fbc8e15ab11f65a0893c` requires pointer hit testing only while the popup is revealed and no `mb-2` gap; fix `a941cf176d15d98ed2f31751a61dcb798eb36daa` implements that continuous hover path.

## Standards and guidance boundary

WAI-ARIA 1.2 defines `aria-disabled` as conveying a perceivable but disabled state; application code still owns suppression of behavior. WCAG 2.2 Success Criterion 1.4.13 requires author-controlled content triggered by hover or focus to be dismissible when applicable, hoverable when pointer hover triggers it, and persistent while the trigger remains valid. The WAI-ARIA Authoring Practices keyboard guidance explains why focusable disabled controls can be appropriate when discoverability matters, but this remains a design trade-off rather than a universal rule. WCAG Technique ARIA1 documents `aria-describedby` as a mechanism for associating descriptive information with a user-interface control through an in-document ID reference.

These references define acceptance semantics for the source and browser tests; they do not by themselves establish WCAG conformance, screen-reader interoperability, or certification.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium. (2023). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. WAI-ARIA Authoring Practices Guide. Retrieved September 6, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls*. Techniques for WCAG 2.2. Retrieved September 6, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA1