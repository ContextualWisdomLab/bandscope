# Discoverable unavailable chord controls

## Decision

BandScope keeps the chord-edit button focusable when editing is unavailable because the action remains useful to discover during rehearsal. The control uses `aria-disabled="true"` rather than native `disabled`, blocks activation before the edit prompt, preserves its stable localized accessible name, and associates a localized recovery instruction with `aria-describedby`.

The recovery copy is action-oriented: users are told to open an editable song to change the chord. The HTML `title` mirrors that recovery copy for pointer users, but BandScope does not treat `title` alone as sufficient assistive-technology evidence. The referenced description is the semantic explanation exposed for assistive technologies.

## Conformance rationale

WAI-ARIA 1.2 defines `aria-disabled` for elements that are perceivable but not operable, while `aria-describedby` identifies content that describes an object. The W3C ARIA Authoring Practices keyboard-interface guidance notes that unavailable controls can remain in the focus order when discoverability is important, using `aria-disabled` rather than native disabling where appropriate. The APG button pattern uses `aria-disabled="true"` for unavailable buttons, and the W3C ARIA1 technique documents `aria-describedby` as a programmatic association between a control and descriptive information.

BandScope therefore verifies exact rendered values rather than inferring accessibility from CSS or source intent:

- the unavailable chord control remains a button and remains keyboard-focusable;
- `aria-disabled` renders exactly as `true`;
- the accessible name remains the localized chord-edit action;
- `aria-describedby` resolves to the exact localized recovery instruction;
- the pointer `title` exposes the same recovery instruction;
- activation does not open the edit prompt when the action is unavailable; and
- enabled chord editing retains the existing localized action label, tooltip, prompt, and update behavior.

## Scope boundary

This change does not claim that a native `title` attribute implements the WAI-ARIA tooltip pattern. The APG tooltip pattern describes a distinct popup that appears on hover or keyboard focus and is referenced from the triggering element. If BandScope later requires a visible keyboard-focus popup, it should use the shared tooltip primitive and validate focus, dismissal, and description behavior explicitly.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *ARIA1: Using the aria-describedby property to provide a descriptive label for user interface controls*. Retrieved August 15, 2026, from https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA1

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Button pattern*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/patterns/button/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Tooltip pattern*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
