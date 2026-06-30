# BandScope Design System

BandScope uses the Figma file as the self-contained design and implementation handoff. This repository mirrors the contract for review and maintenance, but the Figma file must remain usable without Code Connect, Figma access tokens, organization-tier platform features, or external repo docs.

Figma file: https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk

## Source Of Truth

- Visual structure, component anatomy, states, layout examples, implementation paths, prop/state translation, UI repair guidance, screen blueprints, and QA rules live in Figma.
- Production component APIs, tokens, accessibility behavior, and implementation examples are mirrored in this directory for code review.
- Frontend work must resolve conflicts by checking both Figma-local contract pages and production code.
- Figma component names and variant names should mirror the repo contract so visual review remains straightforward.
- Do not introduce required Figma platform features into build, test, release, or CI flows.

## Working Model

1. Start from the Figma component or screen to understand visual intent.
2. Read `28 Implementation Contract`, `29 UI Repair Playbook`, `30 Publisher + QA Matrix`, `31 Component Contract Catalog`, `32 Screen Blueprints`, and `33 Figma-Only Readiness Audit` in the Figma file.
3. Use [component-contract.md](component-contract.md) as a repo mirror of the Figma-only contract.
4. Implement with the listed code component and allowed props before adding local markup.
5. Use documented token classes and component variants first; add one-off classes only for domain-specific visual emphasis.
6. Review the PR against the publisher and frontend checklists below.

Codex and other implementation agents must follow [figma-to-code-workflow.md](figma-to-code-workflow.md) when using the Figma file as development input.

## Frontend Engineer Checklist

- Use the canonical component path and current runtime API listed on Figma page `31 Component Contract Catalog`.
- Treat [component-contract.md](component-contract.md) as a review mirror, not a replacement for the Figma page.
- Keep `Button`, `Badge`, `Input`, `Tabs`, `Progress`, and `Card` semantics intact instead of recreating them with raw elements.
- Preserve focus states, disabled states, `aria-invalid`, labels, and keyboard-accessible regions.
- Keep mobile touch actions at 40px or larger when the design uses the Touch state.
- Keep source controls above the fold on narrow screens and allow wrapping before clipping.
- Preserve the contract test in `apps/desktop/src/App.test.tsx` that keeps `Source controls` before `Analysis summary`.
- Avoid nested card surfaces unless the inner surface is an actual repeated item or interactive module.
- Keep label letter spacing at `0` unless the current code already uses uppercase status metadata.

## Publisher Checklist

- Build pages from existing components and patterns before adding new UI.
- Treat Figma spacing, grouping, and hierarchy as the visual target, but use repo component APIs as the implementation target.
- Use concise headings inside panels; reserve display-scale type for page-level moments.
- Use icon buttons for recognizable actions and visible text buttons for commands that need wording.
- Check desktop and mobile screenshots for clipped text, cramped controls, hidden primary actions, and overlapping status content.
- When a Figma pattern has no extracted code component yet, keep it local to the feature and mark it for extraction in the backlog section of [component-contract.md](component-contract.md). Page 31 explicitly names these feature-local patterns.

## Figma Maintenance

- Keep the Figma Handoff Notes page linked to Figma-only pages first: `28 Implementation Contract`, `29 UI Repair Playbook`, `30 Publisher + QA Matrix`, `31 Component Contract Catalog`, `32 Screen Blueprints`, and `33 Figma-Only Readiness Audit`.
- Keep component descriptions focused on code path, usage, state mapping, and known UI defects.
- Update Figma variants only after confirming the repo component supports the state or after opening a follow-up implementation task.
- If a detail needed for implementation is absent from Figma, treat that absence as a design-system defect and update Figma before coding.
- If Code Connect becomes available later, treat it as an optional publishing layer over this contract, not as the source of truth.

## Current UI Defects Covered

- Mobile source controls clipping: use wrapping source-control layout and Touch button sizing.
- First analysis path buried below metrics: keep source controls ahead of secondary metrics on narrow screens.
- Source-first reading order regression: covered by the `keeps source controls before the analysis summary` App test.
- Inconsistent action styling: route actions through `Button` and icon-button sizing.
- Small touch targets: use `size="lg"` or `size="icon-lg"` when the control is mobile-primary.
- Compact navigation clipping: allow trigger wrapping and avoid fixed-width labels.
- Heavy nested cards: prefer `Card` once per logical panel, with repeated rows inside.
- Dense uppercase labels: keep metadata short and use normal body text for explanations.
