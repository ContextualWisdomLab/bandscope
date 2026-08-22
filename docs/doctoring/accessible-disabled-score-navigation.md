# Accessible disabled score actions

## Scope

BandScope keeps selected score actions discoverable when they are unavailable by using `aria-disabled="true"` plus guarded click handlers instead of native `disabled`. The contract covers the Add score control when no active project exists, existing-score Open/Remove controls without an active project, and score-viewer Previous/Next page controls at pagination boundaries.

For project-bound actions, the visible localized project requirement is associated programmatically through `aria-describedby`; Add/Open/Remove therefore expose the same recovery information to assistive technology while remaining keyboard-focusable. For pagination boundaries, the same localized explanation used for the pointer `title` is associated through `aria-describedby` with a renderer-owned `useId()` target, and that description reference disappears when the action becomes available.

The Add score control is also action-guarded while an attachment operation is already pending. It remains rendered and exposes `aria-disabled="true"`, while the click boundary rejects duplicate activation so one in-flight attach cannot start a second native picker/storage mutation.

This document records the accessibility rationale for PR #731 only. It does not claim that a native `title` is an ARIA tooltip implementation or that keeping every disabled control focusable is universally preferable.

## Contract

- Add/Open/Remove score actions remain keyboard-focusable when no active project exists, so their presence and unavailable state can be discovered.
- `aria-disabled` communicates that an action is currently not operable; the guarded click handler remains the actual fail-closed action boundary.
- Project-bound unavailable actions use `aria-describedby` to point to the visible localized project requirement rather than duplicating hidden recovery copy.
- The Add score action also blocks repeated activation while an attach is already pending; no second bridge request is issued from the guarded branch.
- A boundary page-navigation button remains keyboard-focusable so its presence and unavailable state can be discovered.
- Boundary `aria-describedby` points to localized in-document text explaining the unavailable state and is present only while that exact navigation action is unavailable.
- Native `title` remains a pointer affordance, not the sole accessible explanation.
- Enabled controls do not retain stale disabled-state descriptions.
- Description IDs are renderer-owned and generated with React `useId()`; analysis or file metadata never becomes DOM-ID authority.

## Verification

`apps/desktop/src/features/score/ScoreView.disabled-action-accessibility.test.tsx` verifies that Add/Open/Remove controls without an active project remain focusable, carry `aria-disabled`, resolve `aria-describedby` to the visible localized project requirement, expose recovery titles, and reject activation without invoking the desktop bridge.

`apps/desktop/src/features/score/ScoreView.test.tsx` independently verifies the project-missing guarded branches and the in-flight Add score branch: a repeated click while the first attach promise is pending is prevented and does not issue a second attach request.

`apps/desktop/src/features/score/ScoreViewer.disabled-navigation-accessibility.test.tsx` verifies both ends of a three-page document: the unavailable Previous action on page 1 and unavailable Next action on page 3 each resolve their `aria-describedby` reference to the localized explanation, while the currently available opposite action has no stale disabled description.

## Standards and guidance boundary

WAI-ARIA 1.2 defines `aria-disabled` as conveying a perceivable but disabled state. The WAI-ARIA Authoring Practices Guide notes that focusable disabled controls can be appropriate when discoverability is important, while also explaining that this is a design trade-off rather than a universal rule. WCAG Technique ARIA1 documents `aria-describedby` as a mechanism for associating descriptive information with a user-interface control through an in-document ID reference.

These references support the implemented semantics; they do not by themselves constitute a claim of WCAG conformance or certification.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. WAI-ARIA Authoring Practices Guide. Retrieved August 18, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls*. Techniques for WCAG 2.2. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA1
