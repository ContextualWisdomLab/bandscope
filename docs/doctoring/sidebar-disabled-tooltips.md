# Sidebar disabled-tooltip accessibility boundary

## Problem and buyer impact

The Settings and Help controls are intentionally unavailable but remain discoverable in the sidebar. Native `title` text is not the product authority for the unavailable state: the icon-only triggers need an accessible name independent of tooltip rendering, activation must remain suppressed while `aria-disabled="true"` keeps the controls in the focus order, and tooltip copy must remain readable when translated text expands or the viewport narrows.

The shared Tooltip primitive also used an opacity transition for appearance/disappearance without an explicit reduced-motion override. The effect is small, but it is decorative rather than necessary to convey state, so the primitive should respect the operating-system/browser reduced-motion preference.

## Constraints

- Keep Settings and Help unavailable; this slice does not implement either feature.
- Keep the controls keyboard-discoverable and expose the same localized unavailable-state text as the accessible name and tooltip explanation.
- `aria-disabled` is semantic state, not an interaction lock. Existing `preventUnavailableAction` remains responsible for suppressing pointer- and keyboard-generated activation.
- Do not create a second locale ledger or copy translation authority into the Tooltip primitive.
- Long translated text must wrap within the viewport instead of depending on a fixed English-sized popup.
- The primitive must not claim browser, Narrator, VoiceOver, touch, or visual acceptance from jsdom/class assertions alone.

## Decision

The sidebar uses the existing design-system `Tooltip`, with `TooltipTrigger` retaining `aria-disabled="true"`, a localized `aria-label`, and `preventUnavailableAction`. The shared popup gains a viewport-bounded maximum width, word breaking for long tokens, and `motion-reduce:transition-none` for its decorative opacity transition.

A focused regression renders expanded German tooltip copy and pins the responsive/reduced-motion class contract. This is deliberately a component contract rather than a product-level accessibility acceptance test.

Alternatives rejected:

- Native `disabled`: removes these currently unavailable controls from ordinary keyboard focus and defeats the chosen discoverability contract.
- `aria-disabled` without an event guard: exposes state but leaves activation behavior enabled.
- Tooltip-only naming: makes the accessible name depend on popup behavior rather than the trigger itself.
- Fixed popup width sized for English/Korean: does not address CJK/European-language expansion or narrow viewports.
- Removing all Tooltip animation globally: unnecessary; honoring the user preference is the narrower control.

## Evidence and claim boundary

MDN states that `aria-disabled="true"` communicates disabled semantics but does not suppress functionality; developers must suppress behavior themselves. W3C WCAG 2.2 SC 1.4.10 explains that ordinary text content should reflow within a viewport rather than force two-dimensional scrolling. MDN defines `prefers-reduced-motion` as the user preference for reducing non-essential motion. These sources support the chosen interaction, wrapping, and motion-preference boundaries; they do not prove BandScope conformance by themselves.

Current automated evidence covers DOM semantics already present in `App.test.tsx` plus the Tooltip class contract. Current-head browser geometry, actual hover/focus popup placement, forced-colors behavior, Narrator/VoiceOver announcements, pointer/touch behavior, 400% zoom, and KO/EN/JA/ZH/VI/ES/DE/FR rendered acceptance remain separate UI Delivery Gate evidence.

## TRACEABILITY

- Sidebar product integration: `apps/desktop/src/App.tsx`
- Shared primitive: `apps/desktop/src/components/ui/tooltip.tsx`
- Existing focusable unavailable-control contract: `apps/desktop/src/App.test.tsx`
- Expanded-copy/reduced-motion regression: `apps/desktop/src/components/ui/tooltip.resilience.test.tsx`
- Reviewer learning note: `.jules/palette.md`

## References

Mozilla Developer Network. (2025, November 6). *ARIA: aria-disabled attribute*. MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-disabled

Mozilla Developer Network. (2026, June 10). *prefers-reduced-motion CSS media feature*. MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

W3C Accessibility Guidelines Working Group. (2026, August 10). *Understanding Success Criterion 1.4.10: Reflow*. W3C Web Accessibility Initiative. https://www.w3.org/WAI/WCAG22/Understanding/reflow
