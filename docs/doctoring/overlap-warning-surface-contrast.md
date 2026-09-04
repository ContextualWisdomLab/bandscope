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

The configured BandScope Figma file was freshly re-verified on 2026-08-30. Page `45:86` (`31 Component Contract Catalog`) contains the reusable `OverlapWarningItem` component set at node `254:81` with `Surface=Dark` and `Surface=Light` variants. Contract frame `254:82` renders real instances of the same component set against the dark rehearsal surface (`254:85`) and white Ranges-card surface (`254:96`), while `254:107` records the intentional `NoClashes` state in which the runtime renders no warning list. Fresh metadata also confirms that the former `252:19` reference is no longer present in the file, so it is historical/stale traceability and is not acceptable as design-gate evidence.

The Figma values match the runtime/Storybook contract:

- Dark: background `rgb(251 113 133 / 0.08)`, border `rgb(253 164 175 / 0.2)`, foreground `#FFE4E6`.
- Light: background `#FFF1F2`, border `#FECDD3`, foreground `#9F1239`.

Older component node references in the broader BandScope catalog remain historical traceability unless their specific node is freshly verified. No Code Connect or Figma publishing requirement is added to CI; Storybook remains the executable design-review boundary and Figma remains the visual/component authority.

## Security Notes

This slice changes React presentation, Storybook coverage, shared CSS tokens, design-traceability documentation, and a static Figma design reference only. It does not add or widen filesystem handling, URL fetching, subprocess execution, IPC, WebView authority, updater behavior, model downloads, export paths, credential handling, or runtime network access. The light/dark warning selection operates only on already-provided warning strings and does not create a new trust boundary.

## Verification

Before merge, verify the unchanged exact head with:

- focused `OverlapWarningList` component tests;
- Storybook rendering for dark, light, and empty states;
- the repository's configured Storybook accessibility checks;
- current live Figma metadata and screenshot evidence for component set `254:81`, contract frame `254:82`, dark preview `254:85`, light preview `254:96`, and empty-state note `254:107`; and
- every required repository and organization check plus qualifying independent human review.

Queued, skipped-required, stale, predecessor-head, model-only, self/author, synthetic, or administrative-bypass evidence is not sufficient.

## Reference

World Wide Web Consortium. (2024, December 12). *Web Content Accessibility Guidelines (WCAG) 2.2*. https://www.w3.org/TR/WCAG22/
