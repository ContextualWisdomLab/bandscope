# Reduced-motion first-notes navigation

## Scope

The workspace first-notes action scrolls and focuses the existing groove map after a player selects a part. Smooth scrolling is not essential to exposing the selected role's analyzed notes or range, so BandScope honors the operating-system/user-agent reduced-motion preference for this interaction-triggered navigation.

## Contract

- The default first-notes path preserves the existing smooth scroll and focus behavior.
- When `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true, the same action uses immediate (`auto`) scrolling and still focuses the same renderer-owned `workspace-groove-map` target.
- If `matchMedia` is unavailable, BandScope preserves the existing smooth behavior rather than inventing a preference.
- The preference changes animation behavior only; it does not change role selection, note/range evidence, action availability, or filesystem/network/model authority.

## Verification

`apps/desktop/src/features/workspace/Workspace.first-notes-reduced-motion.test.tsx` selects the demo Bass Guitar role, opens its real first-note action, and requires `scrollIntoView({ block: "nearest", behavior: "auto" })` when reduced motion is requested. Existing workspace tests continue to cover the default navigation, focus, note/range status, and fail-closed unavailable action.

## Standards rationale

WCAG 2.2 Success Criterion 2.3.3, Animation from Interactions (Level AAA), requires non-essential interaction-triggered motion animation to be disableable. W3C Technique SCR40 documents evaluating `prefers-reduced-motion` in JavaScript to prevent such motion. The groove-map scroll animation is not necessary to identify the selected part's notes or range, so respecting that preference is the narrow behavior-preserving implementation.

This record is implementation rationale and test evidence, not a claim of WCAG certification or overall conformance.

## References

World Wide Web Consortium. (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation, December 12, 2024). https://www.w3.org/TR/WCAG22/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Understanding Success Criterion 2.3.3: Animation from interactions*. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *SCR40: Using the CSS prefers-reduced-motion query in JavaScript to prevent motion*. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40
