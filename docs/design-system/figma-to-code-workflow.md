# Figma To Code Workflow

This workflow is for Codex, Frontend Engineers, and Publishers using the BandScope Figma file without Code Connect.

Figma is the visual, structural, and handoff input. The repository remains the runtime source of truth for tests and release behavior, but the Figma file must carry enough implementation guidance to start work without opening these docs. Missing implementation detail inside Figma is a design-system defect.

## Can Codex Develop From This Figma?

Yes, with translation. Codex can read the Figma file for component anatomy, variants, layout, text hierarchy, visual states, implementation paths, current runtime prop mappings, TSX examples, screen blueprints, and design-defect guidance. Codex must then translate that intent into the existing React components and Tailwind classes in production code.

Codex must not paste generated Figma code directly into the app. Generated Figma code is reference material only.

## Required Loop

1. Identify the target Figma node, screen, or component set.
2. Read Figma structure and variants through Figma MCP or the node URL.
3. Read `31 Component Contract Catalog` for the matching source path, current runtime API, TSX example, and QA note.
4. Read `32 Screen Blueprints` for mobile and desktop placement before changing layout.
5. Read `34 Workspace State Matrix` before changing workspace empty, loading, error, ready, Groove Map, or Source Control Stack states.
6. Check `33 Figma-Only Readiness Audit` for current visual audit evidence and tool access limits before deciding a Figma page is empty or a plugin-backed review is required.
7. Use [component-contract.md](component-contract.md) and [product-design-handoff.md](product-design-handoff.md) only as repo mirrors when working in code review.
8. Inspect the actual code component before editing.
9. If a Figma blueprint block is placeholder-only, verify whether the matching runtime surface exists before coding. Fill Figma when the code already exists; implement code only when the surface is genuinely missing.
10. If a Figma card, contract row, or blueprint detail overflows its parent or overlaps a sibling, repair Figma first unless the runtime surface is genuinely missing.
11. Implement with existing components first.
12. Add or update tests when behavior, accessibility, reading order, or reusable component APIs change.
13. Verify with typecheck and the narrowest useful test command.
14. For visible UI changes, run the app and compare desktop and mobile screenshots against Figma intent.
15. If implementation needs to diverge from Figma, document whether the code API, accessibility, runtime behavior, or responsive layout caused the divergence.

## What Figma Can Provide

- Component names, node IDs, descriptions, variants, and component property definitions.
- Source paths, current runtime API notes, TSX examples, and QA notes visibly stored on `31 Component Contract Catalog` and mirrored in component descriptions plus `bandscope` shared metadata.
- Visual measurements, spacing, hierarchy, state examples, and screenshots.
- Mobile 375x812 and desktop 1440x900 repair targets on `32 Screen Blueprints`.
- Figma-only readiness evidence on `33 Figma-Only Readiness Audit`.
- Whole-workspace empty, loading, error, ready, Groove Map, and Source Control Stack state contracts on `34 Workspace State Matrix`.
- Review perspective notes on `33 Figma-Only Readiness Audit`, including how `Ponytail`, `Superpowers`, and `Product Design` were applied without adding Figma platform dependencies.
- Fourth-pass restore evidence on `33 Figma-Only Readiness Audit`, including the 2026-07-01 finding that pages 28-34 could appear empty or stale unless each page was loaded before inspection.
- Structural audit evidence on `33 Figma-Only Readiness Audit`, including the post-restore pass that loads each page with `figma.setCurrentPageAsync(page)` and confirms pages 28-34 have one visible text-bearing root frame with no empty, duplicate-root, low-detail, parent-overflow, manual-height clipping, or top-level overlap candidates.
- Workspace state repair evidence on `33 Figma-Only Readiness Audit`, including the rebuilt page 34 root `99:560` that covers the implemented `WorkspaceStates.tsx` state contract.
- Product Design handoff material, including IA, screen definitions, key screens, wireframes, and user stories that must also be visible in Figma before a visual-change PR merges.
- Domain patterns such as Source Control Stack, Groove Map, Section Roadmap Card, and Export Action Group.
- UI-defect guidance for clipping, touch targets, source-control priority, and panel density.

## What The Repo Must Provide

- Canonical React component paths and prop names.
- Allowed variants, sizes, accessibility semantics, and composition rules.
- Tests, build behavior, and CI requirements.
- Decisions about whether a Figma pattern should become a reusable code component.

## Translation Rules

- Translate Figma `Button / Default` through `Button`, not raw `button` markup.
- Translate Figma `Input` states through native `type`, `disabled`, and `aria-invalid`.
- Translate Figma `Tabs Trigger` through `Tabs`, `TabsList`, and `TabsTrigger`.
- Translate confidence UI through `ConfidenceBadge`, not local color classes.
- Translate `34 Workspace State Matrix` through `EmptyState`, `LoadingState`, `ErrorState`, `Workspace`, `GrooveMap`, and the feature-local Source Control Stack. Do not replace these states with blank panels.
- Translate Figma pattern components in the backlog as feature-local markup until reuse justifies extraction.
- Keep generated Figma asset URLs out of production code unless the asset has been intentionally added to the repo.

## When To Stop And Reassess

- The Figma component has no matching contract entry.
- A Figma variant has no supported code prop or class strategy.
- A Figma contract names a prop that does not exist in the current runtime component.
- A required implementation detail exists only in repo docs and not in Figma.
- A workspace empty, loading, error, ready, Groove Map, or Source Control Stack state is not represented on `34 Workspace State Matrix`, page `25 Groove Map`, page `26 Source Control Stack`, or page `31 Component Contract Catalog`.
- A named review perspective such as `Ponytail` or `Superpowers` is treated as a tool-backed requirement without an actual available tool or documented project standard.
- A page-level Figma metadata overview or direct Plugin API page inspection appears empty before the page has been loaded with `figma.setCurrentPageAsync(page)`, or this repo mirror claims populated Figma content that is not present in the loaded Figma page.
- A Figma screen blueprint has a large placeholder-only or label-only section and the matching runtime surface has not been checked.
- A Figma row, card, or blueprint detail only reads correctly because text or nested content spills outside its parent or overlaps a neighboring element.
- A generated Figma layout would require duplicating an existing component.
- The implementation would add a Figma token, access token, publish step, or platform-plan requirement.
- Visual parity conflicts with accessibility, keyboard behavior, localization, or responsive constraints.

## PR Notes

PRs that implement Figma-driven UI should include:

- Figma node URL or page name.
- Contract entry used.
- Code component paths touched.
- Verification commands, contract tests, and screenshot viewports, when applicable.
- Any divergence from Figma and the reason.
