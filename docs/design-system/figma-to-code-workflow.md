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
5. Check `33 Figma-Only Readiness Audit` for current visual audit evidence and tool access limits before deciding a Figma page is empty or a plugin-backed review is required.
6. Use [component-contract.md](component-contract.md) only as a repo mirror when working in code review.
7. Inspect the actual code component before editing.
8. If a Figma blueprint block is placeholder-only, verify whether the matching runtime surface exists before coding. Fill Figma when the code already exists; implement code only when the surface is genuinely missing.
9. Implement with existing components first.
10. Add or update tests when behavior, accessibility, reading order, or reusable component APIs change.
11. Verify with typecheck and the narrowest useful test command.
12. For visible UI changes, run the app and compare desktop and mobile screenshots against Figma intent.
13. If implementation needs to diverge from Figma, document whether the code API, accessibility, runtime behavior, or responsive layout caused the divergence.

## What Figma Can Provide

- Component names, node IDs, descriptions, variants, and component property definitions.
- Source paths, current runtime API notes, TSX examples, and QA notes visibly stored on `31 Component Contract Catalog` and mirrored in component descriptions plus `bandscope` shared metadata.
- Visual measurements, spacing, hierarchy, state examples, and screenshots.
- Mobile 375x812 and desktop 1440x900 repair targets on `32 Screen Blueprints`.
- Figma-only readiness evidence on `33 Figma-Only Readiness Audit`.
- Tool access limits on `33 Figma-Only Readiness Audit`, including the 2026-07-01 `Ponytail` and `Superpowers` recheck note.
- Visual audit evidence on `33 Figma-Only Readiness Audit`, including the 2026-07-01 pass that confirms pages 28-33 have visible root frames and no remaining manual-height text clipping candidates.
- Placeholder-section audit evidence on `33 Figma-Only Readiness Audit`, including the 2026-07-01 pass that confirms page 32 has no remaining label-only blueprint sections.
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
- Translate Figma pattern components in the backlog as feature-local markup until reuse justifies extraction.
- Keep generated Figma asset URLs out of production code unless the asset has been intentionally added to the repo.

## When To Stop And Reassess

- The Figma component has no matching contract entry.
- A Figma variant has no supported code prop or class strategy.
- A Figma contract names a prop that does not exist in the current runtime component.
- A required implementation detail exists only in repo docs and not in Figma.
- A named review perspective such as `Ponytail` or `Superpowers` is treated as a tool-backed requirement without an actual available tool or documented project standard.
- A page-level Figma metadata overview appears empty but the page root node has not been inspected directly.
- A Figma screen blueprint has a large placeholder-only or label-only section and the matching runtime surface has not been checked.
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
