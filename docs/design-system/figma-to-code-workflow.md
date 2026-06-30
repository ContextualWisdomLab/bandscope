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
5. Use [component-contract.md](component-contract.md) only as a repo mirror when working in code review.
6. Inspect the actual code component before editing.
7. Implement with existing components first.
8. Add or update tests when behavior, accessibility, reading order, or reusable component APIs change.
9. Verify with typecheck and the narrowest useful test command.
10. For visible UI changes, run the app and compare desktop and mobile screenshots against Figma intent.
11. If implementation needs to diverge from Figma, document whether the code API, accessibility, runtime behavior, or responsive layout caused the divergence.

## What Figma Can Provide

- Component names, node IDs, descriptions, variants, and component property definitions.
- Source paths, current runtime API notes, TSX examples, and QA notes visibly stored on `31 Component Contract Catalog` and mirrored in component descriptions plus `bandscope` shared metadata.
- Visual measurements, spacing, hierarchy, state examples, and screenshots.
- Mobile 375x812 and desktop 1440x900 repair targets on `32 Screen Blueprints`.
- Figma-only readiness evidence on `33 Figma-Only Readiness Audit`.
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
