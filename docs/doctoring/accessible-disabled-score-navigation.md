# Accessible disabled score navigation

## Scope

BandScope keeps score-viewer Previous/Next page controls discoverable at pagination boundaries by using `aria-disabled="true"` plus guarded click handlers instead of native `disabled`. When a boundary control is unavailable, the same localized explanation used for its pointer `title` is also associated programmatically through `aria-describedby` with a renderer-owned `useId()` target. The description reference is removed again as soon as the action becomes available.

This document records the accessibility rationale for PR #731 only. It does not claim that a native `title` is an ARIA tooltip implementation or that keeping every disabled control focusable is universally preferable.

## Contract

- A boundary page-navigation button remains keyboard-focusable so its presence and unavailable state can be discovered.
- `aria-disabled` communicates that the button is currently not operable; the click handler remains the actual fail-closed action boundary.
- `aria-describedby` points to localized in-document text explaining the unavailable state. The reference is present only while that exact action is unavailable.
- Native `title` remains a pointer affordance, not the sole accessible explanation.
- The enabled button does not retain a stale disabled-state description.
- Description IDs are renderer-owned and generated with React `useId()`; analysis or file metadata never becomes DOM-ID authority.

## Verification

`apps/desktop/src/features/score/ScoreViewer.disabled-navigation-accessibility.test.tsx` verifies both ends of a three-page document: the unavailable Previous action on page 1 and unavailable Next action on page 3 each resolve their `aria-describedby` reference to the localized explanation, while the currently available opposite action has no stale disabled description.

## Standards and guidance boundary

WAI-ARIA 1.2 defines `aria-disabled` as conveying a perceivable but disabled state. The WAI-ARIA Authoring Practices Guide notes that focusable disabled controls can be appropriate when discoverability is important, while also explaining that this is a design trade-off rather than a universal rule. WCAG Technique ARIA1 documents `aria-describedby` as a mechanism for associating descriptive information with a user-interface control through an in-document ID reference.

These references support the implemented semantics; they do not by themselves constitute a claim of WCAG conformance or certification.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. WAI-ARIA Authoring Practices Guide. Retrieved August 18, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls*. Techniques for WCAG 2.2. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA1
