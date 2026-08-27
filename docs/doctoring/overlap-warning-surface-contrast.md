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

A fresh metadata read of the configured BandScope Figma file on 2026-08-28 returned only the top-level `00 Cover` page. Historical component nodes referenced by this branch, including `19:239`, are therefore not treated as current Figma evidence. The runtime/Storybook contrast repair is valid and executable, but this UI branch must remain unmerged until the shared Figma component/state authority is restored and verified against both dark and light surfaces.

No Code Connect or Figma publishing requirement is added to CI; the repository design contract remains the executable code/Storybook boundary while Figma drift is repaired in its own design authority.

## Verification

Before merge, verify the unchanged exact head with:

- focused `OverlapWarningList` component tests;
- Storybook rendering for dark, light, and empty states;
- the repository's configured Storybook accessibility checks;
- current live Figma metadata/screenshots for the restored shared warning component; and
- every required repository and organization check plus qualifying independent human review.

Queued, stale, predecessor-head, model-only, or synthetic evidence is not sufficient.

## Reference

World Wide Web Consortium. (2024, December 12). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/
