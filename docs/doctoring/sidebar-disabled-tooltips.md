# App unavailable-tooltip accessibility boundary

## Problem and buyer impact

Several App controls are intentionally unavailable while prerequisite product state is missing. Settings and Help remain discoverable in the sidebar, Import and Export are unavailable navigation entries, and Save is unavailable until a rehearsal song exists. Native `title` text is not the product authority for any of these states: controls need an accessible action name independent of tooltip rendering, activation must remain suppressed while `aria-disabled="true"` keeps them in the focus order, and the reason for an unavailable buyer action must remain available to assistive technology without depending on hover.

The shared Tooltip primitive also used an opacity transition for appearance/disappearance without an explicit reduced-motion override. The effect is decorative rather than necessary to convey state, so the primitive respects the operating-system/browser reduced-motion preference.

## Constraints

- Keep unavailable features unavailable; this slice does not implement Settings, Help, Import, Export, or a pre-analysis Save path.
- Keep intentionally discoverable controls keyboard-focusable and expose a localized action name independently of Tooltip popup state.
- `aria-disabled` is semantic state, not an interaction lock. `preventUnavailableAction` / `blockInactiveNavActivation` remain responsible for suppressing pointer- and keyboard-generated activation.
- For Save, preserve `Save Project` as the action name and expose `Analyze a song to enable saving` as a persistent description as well as the visual Tooltip explanation. Do not collapse the reason into the action name.
- Do not create a second locale ledger or copy translation authority into the Tooltip primitive.
- Long translated text must wrap within the viewport instead of depending on a fixed English-sized popup.
- The primitive and jsdom tests must not claim browser, Narrator, VoiceOver, touch, or visual acceptance.

## Decision

The sidebar and unavailable navigation entries use the existing design-system `Tooltip`, with `TooltipTrigger` retaining `aria-disabled="true"`, a localized `aria-label`, and an explicit activation guard. The shared popup keeps a viewport-bounded maximum width, word breaking for long tokens, and `motion-reduce:transition-none` for its decorative opacity transition.

The unavailable Save control uses the same Tooltip system but preserves the existing styled `Button` through Base UI's `TooltipTrigger render={...}` composition. The rendered button remains focusable with `aria-disabled="true"`, has no native `title`, and references an always-present screen-reader-only explanation through `aria-describedby`. The Tooltip repeats that localized reason visually for pointer/focus discovery. The successful Save path is unchanged.

A focused Save regression first locked the missing contract: focusable `aria-disabled`, no native `title`, and a persistent localized description. The production repair then composed Tooltip + Button without changing Save activation authority. Existing Tooltip resilience tests continue to verify Base UI native-button/prop forwarding and responsive/reduced-motion class contracts.

This remains a component/source contract rather than product-level accessibility acceptance.

Alternatives rejected:

- Native `disabled`: removes these intentionally discoverable controls from ordinary keyboard focus.
- `aria-disabled` without an event guard: exposes state but leaves activation behavior enabled.
- Native `title`: hover-dependent, inconsistent with the shared product Tooltip, and not a sufficient persistent explanation for the unavailable Save state.
- Tooltip-only explanation: makes the Save reason depend on popup state; the persistent `aria-describedby` alternative remains available when the popup is absent.
- Replacing `Save Project` with the prerequisite reason as the accessible name: loses the action identity instead of describing why that action is unavailable.
- Radix `asChild` repair: BandScope uses Base UI Tooltip. Base UI supports composing a trigger with another rendered component via `render`.
- Fixed popup width sized for English/Korean: does not address CJK/European-language expansion or narrow viewports.
- Removing all Tooltip animation globally: unnecessary; honoring the user preference is the narrower control.

## Evidence and claim boundary

WAI-ARIA 1.3 distinguishes an accessible name from a more verbose accessible description and recommends `aria-describedby` when a short description already exists in the DOM. W3C Authoring Practices likewise documents a button referencing sibling descriptive text with `aria-describedby` and notes that `title` is a lower-priority fallback that can be inaccessible to users without a hover-capable pointing device. That directly supports keeping `Save Project` as the action name while exposing the prerequisite reason as a separate persistent description.

MDN states that `aria-disabled="true"` communicates disabled semantics but does not suppress functionality; developers must suppress behavior themselves. W3C WCAG 2.2 SC 1.4.10 explains that ordinary text content should reflow within a viewport rather than force two-dimensional scrolling. MDN defines `prefers-reduced-motion` as the user preference for reducing non-essential motion. These sources support the interaction, description, wrapping, and motion-preference boundaries; they do not prove BandScope conformance by themselves.

The repository lockfile on this stack identifies `@base-ui/react` 1.7.0. The Base UI trigger contract renders a button by default and supports the `render` composition used for the unavailable Save Button. Earlier review that reasoned from Radix-specific semantics was dismissed only after the repository added Base UI trigger-forwarding evidence; that dismissal is not an approval and does not satisfy current-head review.

Current automated evidence covers App DOM semantics, the focused unavailable-Save description contract, Base UI trigger forwarding, and the Tooltip class contract. Current-head browser geometry, actual hover/focus/Escape popup behavior, forced-colors, Narrator/VoiceOver announcements, pointer/touch behavior, 400% zoom, and KO/EN/JA/ZH/VI/ES/DE/FR rendered acceptance remain separate UI Delivery Gate evidence.

## TRACEABILITY

- App product integration: `apps/desktop/src/App.tsx`
- Focused unavailable-Save regression: `apps/desktop/src/App.unavailableSave.test.tsx`
- Existing App integration regressions: `apps/desktop/src/App.test.tsx`
- Shared primitive: `apps/desktop/src/components/ui/tooltip.tsx`
- Trigger-forwarding and expanded-copy/reduced-motion regression: `apps/desktop/src/components/ui/tooltip.resilience.test.tsx`
- Reviewer learning note: `.jules/palette.md`
- Dependency authority: root `package-lock.json`, `@base-ui/react` 1.7.0 on this stack
- Upstream implementation authority: Base UI Tooltip/Button render composition
- Accessibility description authority: WAI-ARIA 1.3 and W3C Authoring Practices accessible-name/description guidance

## Security Notes

### Trust boundary

The MDN, W3C, and upstream Base UI URLs in this doctoring note are documentation references only. BandScope does not fetch, execute, embed, or navigate to them at runtime, and this Tooltip change adds no network request, WebView navigation, subprocess, IPC, updater, model-download, credential, or trust-boundary path. Runtime behavior remains limited to the existing local design-system Tooltip, Button, and localized in-process strings.

## References

Mozilla Developer Network. (2025, November 6). *ARIA: aria-disabled attribute*. MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-disabled

Mozilla Developer Network. (2026, June 10). *prefers-reduced-motion CSS media feature*. MDN Web Docs. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

World Wide Web Consortium. (2026, June 4). *Accessible Rich Internet Applications (WAI-ARIA) 1.3*. https://www.w3.org/TR/2026/WD-wai-aria-1.3-20260604/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Providing accessible names and descriptions*. Retrieved September 21, 2026, from https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/

W3C Accessibility Guidelines Working Group. (2026, August 10). *Understanding Success Criterion 1.4.10: Reflow*. W3C Web Accessibility Initiative. https://www.w3.org/WAI/WCAG22/Understanding/reflow
