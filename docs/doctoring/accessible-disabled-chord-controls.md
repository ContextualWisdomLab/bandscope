# Discoverable unavailable chord controls

## Decision

BandScope keeps the chord-edit button focusable when editing is unavailable because the action remains useful to discover during rehearsal. The control uses `aria-disabled="true"` rather than native `disabled`, blocks activation in the event handler, preserves its stable localized accessible name, and attaches a localized recovery description with `aria-describedby`.

The recovery copy is action-oriented: users are told to open an editable song to change the chord. The HTML `title` mirrors that recovery copy for pointer users, but BandScope does not treat `title` alone as sufficient assistive-technology evidence. The referenced description is the semantic explanation for assistive technologies.

## Conformance rationale

WAI-ARIA defines `aria-disabled` as the state for a perceivable but unavailable control. The W3C ARIA Authoring Practices Guide further distinguishes native disabled controls, which browsers remove from the tab sequence, from cases where an unavailable control should remain discoverable and focusable. The APG button pattern requires an unavailable button to expose `aria-disabled="true"` and recommends `aria-describedby` when a description of the button's function is present.

BandScope therefore verifies exact rendered values rather than inferring accessibility from CSS or source intent:

- the unavailable button remains a button in the accessibility tree and keyboard focus order;
- `aria-disabled` renders exactly as `true`;
- the accessible name remains the localized chord-edit action;
- `aria-describedby` resolves to the exact localized recovery instruction;
- the pointer `title` exposes the same recovery instruction;
- activation does not open the edit prompt when the action is unavailable; and
- enabled chord editing retains the existing localized action label, tooltip, prompt, and update behavior.

## Scope boundary

This change does not claim that a native `title` attribute implements the WAI-ARIA tooltip pattern. The APG tooltip pattern describes a distinct popup that appears on hover or keyboard focus and is referenced with `aria-describedby`; that pattern remains separate from this bounded disabled-control slice. If BandScope later requires a visible keyboard-focus popup, it should use the existing shared tooltip primitive and validate focus, dismissal, and description behavior explicitly.

## References

World Wide Web Consortium. (2023). *Accessible Rich Internet Applications (WAI-ARIA) 1.2*. https://www.w3.org/TR/wai-aria/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Button pattern*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/patterns/button/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Developing a keyboard interface*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Tooltip pattern*. ARIA Authoring Practices Guide. Retrieved August 15, 2026, from https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/