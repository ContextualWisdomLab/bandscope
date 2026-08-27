# Overlap Warning Surface Contrast

## Customer-facing defect

`OverlapWarningList` is shared by the dark rehearsal workspace and the light Ranges cards. The component previously applied the dark-workspace foreground token in both contexts, so a warning rendered on a white Ranges card could lose readable text contrast even though the same component was legible on the dark workspace.

## Repair contract

The shared component keeps one semantic warning primitive and selects a surface contract instead of duplicating markup:

- `surface="dark"` remains the default for the rehearsal workspace;
- `surface="light"` uses `--bandscope-overlap-light-bg`, `--bandscope-overlap-light-border`, and `--bandscope-overlap-light-fg` for light cards;
- the Ranges feature explicitly selects the light surface;
- Storybook exposes both surface contexts; and
- component tests require the light-surface token contract so a later refactor cannot silently reuse dark-only text colors.

The light warning foreground/background pair is chosen to satisfy WCAG 2.2 Success Criterion 1.4.3 for normal text. WCAG 2.2 requires at least 4.5:1 contrast for ordinary text; large text has a separate 3:1 threshold. This component renders compact warning copy and therefore uses the normal-text requirement.

## Design authority status

The configured BandScope Figma file was freshly re-verified and repaired on 2026-08-28. Page `45:86` (`31 Component Contract Catalog`) now contains a reusable `Overlap Warning List` component set at node `252:19` with `Surface=Dark` and `Surface=Light` variants. Review board `252:2` renders real instances of both variants against the dark rehearsal surface and white Ranges-card surface, and records the exact runtime tokens, accessible list semantics, decorative icon treatment, responsive wrapping, duplicate-warning behavior, and the intentional empty/no-node state.

The Figma values match the runtime/Storybook contract:

- Dark: background `rgb(251 113 133 / 0.08)`, border `rgb(253 164 175 / 0.2)`, foreground `#FFE4E6`.
- Light: background `#FFF1F2`, border `#FECDD3`, foreground `#9F1239`.

Older component node references in the broader BandScope catalog remain historical traceability unless their specific node is freshly verified. No Code Connect or Figma publishing requirement is added to CI; Storybook remains the executable design-review boundary and Figma remains the visual/component authority.

## Verification

Before merge, verify the unchanged exact head with:

- focused `OverlapWarningList` component tests;
- Storybook rendering for dark, light, and empty states;
- the repository's configured Storybook accessibility checks;
- current live Figma metadata and screenshot evidence for nodes `252:19` and `252:2`; and
- every required repository and organization check plus qualifying independent human review.

Queued, skipped-required, stale, predecessor-head, model-only, self/author, synthetic, or administrative-bypass evidence is not sufficient.

## Reference

World Wide Web Consortium. (2024, December 12). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/
