# Reduced-motion first-entrance navigation

## Scope

The workspace First Entrance action is an intentional user interaction that scrolls the song-structure map to the resolved section. Smooth scrolling is non-essential to finding that section, so BandScope uses the operating-system/user-agent reduced-motion preference to choose the navigation animation behavior.

This record applies only to the renderer-owned workspace scroll performed by `FirstEntranceCallout`. Player playback remains owned by the explicit playback callback and is not altered by this decision.

## Contract

- The default workspace path preserves the existing smooth scroll to the renderer-owned section position.
- When `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true, the same action uses immediate (`auto`) scrolling instead of smooth animation.
- If `matchMedia` is unavailable, BandScope preserves the existing smooth behavior rather than inventing a preference.
- Reduced-motion handling does not change entrance selection, section authority, playback authority, or the fail-closed metadata validation contract.
- The regression test covers the preference-aware JavaScript path directly; deterministic product/security/coverage gates remain independent of model judgment.

## Standards rationale

WCAG 2.2 Success Criterion 2.3.3, Animation from Interactions (Level AAA), requires interaction-triggered motion animation to be disableable when it is not essential. W3C's Understanding document explicitly recommends honoring user motion preferences, and Technique SCR40 documents evaluating `prefers-reduced-motion` in JavaScript to prevent interaction-triggered motion. The First Entrance scroll animation is not essential to conveying which section is selected, so respecting the preference is the narrower behavior-preserving implementation.

This is an implementation rationale and evidence record, not a claim that BandScope is WCAG certified or that this single behavior establishes conformance.

## Verification

`apps/desktop/src/features/workspace/FirstEntranceCallout.reduced-motion.test.tsx` sets the reduced-motion media query to `reduce`, activates the exact buyer-visible First Entrance workspace action, and requires the renderer-owned target to receive `scrollIntoView({ block: "nearest", behavior: "auto" })`. Existing First Entrance tests continue to cover the default smooth-scroll contract.

## References

World Wide Web Consortium. (2024). *Web Content Accessibility Guidelines (WCAG) 2.2* (W3C Recommendation, December 12, 2024). https://www.w3.org/TR/WCAG22/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *Understanding Success Criterion 2.3.3: Animation from interactions*. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions/

World Wide Web Consortium, Web Accessibility Initiative. (n.d.). *SCR40: Using the CSS prefers-reduced-motion query in JavaScript to prevent motion*. Retrieved August 18, 2026, from https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40
