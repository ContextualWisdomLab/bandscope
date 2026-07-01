# BandScope Design System

BandScope uses the Figma file as the self-contained design and implementation handoff. This repository mirrors the contract for review and maintenance, but the Figma file must remain usable without Code Connect, Figma access tokens, organization-tier platform features, or external repo docs.

Figma file: https://www.figma.com/design/zthWmqfNKUgJBECvv002Qk

## Source Of Truth

- Visual structure, component anatomy, states, layout examples, implementation paths, prop/state translation, UI repair guidance, screen blueprints, and QA rules live in Figma.
- Production component APIs, tokens, accessibility behavior, and implementation examples are mirrored in this directory for code review.
- Frontend work must resolve conflicts by checking both Figma-local contract pages and production code.
- Figma component names and variant names should mirror the repo contract so visual review remains straightforward.
- Do not introduce required Figma platform features into build, test, release, or CI flows.
- `Ponytail` and `Superpowers` are recorded on Figma page `33 Figma-Only Readiness Audit` as unavailable callable tools for this handoff. The explicit plugin links were rechecked on 2026-07-01 and still exposed no callable tools or install candidates, so treat them as named review perspectives only unless a future session exposes actual tools or project standards for them.

## Working Model

1. Start from the Figma component or screen to understand visual intent.
2. Read `28 Implementation Contract`, `29 UI Repair Playbook`, `30 Publisher + QA Matrix`, `31 Component Contract Catalog`, `32 Screen Blueprints`, `33 Figma-Only Readiness Audit`, and `34 Workspace State Matrix` in the Figma file.
3. Use [component-contract.md](component-contract.md) as a repo mirror of the Figma-only contract.
4. Implement with the listed code component and allowed props before adding local markup.
5. Use documented token classes and component variants first; add one-off classes only for domain-specific visual emphasis.
6. Review the PR against the publisher and frontend checklists below.

Codex and other implementation agents must follow [figma-to-code-workflow.md](figma-to-code-workflow.md) when using the Figma file as development input.

## Visual Audit Snapshot

- Figma page `33 Figma-Only Readiness Audit` contains the `2026-07-01 visual pass - PASS` evidence row.
- Pages `28 Implementation Contract`, `29 UI Repair Playbook`, `30 Publisher + QA Matrix`, `31 Component Contract Catalog`, `32 Screen Blueprints`, and `33 Figma-Only Readiness Audit` each contain one visible root frame.
- The 2026-07-01 Figma audit found no empty root, hidden root, top-level overlap candidate, or remaining manual-height text clipping candidate on pages 28-33 after the intro and gap text was changed to auto-height.
- Figma page `33 Figma-Only Readiness Audit` also contains the `2026-07-01 placeholder section pass - PASS` evidence row.
- Page `32 Screen Blueprints` was hardened after the first visual pass: its mobile and desktop blocks now show concrete UI anatomy for header/role controls, source controls, status/progress, metric cards, navigation, console details, section roadmap, groove map, and export actions.
- The stricter page 32 audit found `0` label-only/empty blueprint sections and `0` text clipping candidates after those additions.
- A second-pass 2026-07-01 Figma audit found `10` overflow candidates and `2` sibling-overlap candidates across pages 28-33. Page `29 UI Repair Playbook`, page `31 Component Contract Catalog`, and page `32 Screen Blueprints` were repaired in Figma; the final audit reports `0` overflow candidates and `0` sibling-overlap candidates.
- `32 Screen Blueprints` remains the visual target for source-first mobile and desktop repair work. The current app implements that source-first order in [App.tsx](../../apps/desktop/src/App.tsx), and the regression is covered by [App.test.tsx](../../apps/desktop/src/App.test.tsx).
- If a Figma metadata overview appears to show pages 28-33 as empty, inspect the page root node directly before treating it as a defect. The verified root IDs are `50:2`, `50:20`, `50:59`, `51:2`, `50:86`, and `50:133`.
- If a blueprint block is only a large labeled box, treat that as a Figma handoff defect unless the corresponding runtime surface is genuinely unimplemented. The 2026-07-01 audit found the code was implemented, so Figma page 32 was corrected instead of changing app code.
- A third-pass 2026-07-01 state audit found the app already implements `EmptyState`, `LoadingState`, and `ErrorState` in [WorkspaceStates.tsx](../../apps/desktop/src/features/workspace/WorkspaceStates.tsx), with routing in [App.tsx](../../apps/desktop/src/App.tsx). Figma was missing a standalone whole-workspace state contract, so page `34 Workspace State Matrix` was added with root node `80:3`.
- Page `33 Figma-Only Readiness Audit` contains `2026-07-01 workspace state contract pass - PASS` at node `80:130`.
- The final structural audit across pages `28` through `34` reported `0` empty frames/sections, `0` low-detail placeholder sections, `0` manual-height clipping candidates, and `0` top-level overlap candidates.

## Frontend Engineer Checklist

- Use the canonical component path and current runtime API listed on Figma page `31 Component Contract Catalog`.
- Treat [component-contract.md](component-contract.md) as a review mirror, not a replacement for the Figma page.
- Keep `Button`, `Badge`, `Input`, `Tabs`, `Progress`, and `Card` semantics intact instead of recreating them with raw elements.
- Preserve focus states, disabled states, `aria-invalid`, labels, and keyboard-accessible regions.
- Use `34 Workspace State Matrix` before changing workspace empty, loading, error, ready, Groove Map, or Source Control Stack state behavior.
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

- Keep the Figma Handoff Notes page linked to Figma-only pages first: `28 Implementation Contract`, `29 UI Repair Playbook`, `30 Publisher + QA Matrix`, `31 Component Contract Catalog`, `32 Screen Blueprints`, `33 Figma-Only Readiness Audit`, and `34 Workspace State Matrix`.
- Keep component descriptions focused on code path, usage, state mapping, and known UI defects.
- Update Figma variants only after confirming the repo component supports the state or after opening a follow-up implementation task.
- If a detail needed for implementation is absent from Figma, treat that absence as a design-system defect and update Figma before coding.
- If a Figma screen blueprint contains placeholder-only or label-only sections, compare against the runtime code first. Implement code only when the surface is missing; otherwise fill the Figma blueprint with concrete UI anatomy.
- If a Figma card or blueprint detail visibly overflows its parent, overlaps a sibling, or depends on unclipped spillover to be readable, treat it as a Figma handoff defect unless the corresponding runtime surface is missing.
- If Code Connect becomes available later, treat it as an optional publishing layer over this contract, not as the source of truth.
- Keep the `Ponytail and Superpowers access note`, `2026-07-01 visual pass`, `2026-07-01 placeholder section pass`, `2026-07-01 overflow/overlap repair pass`, and `2026-07-01 workspace state contract pass` rows on page 33 current whenever those tools, standards, visual audit results, or runtime state contracts change.

## Current UI Defects Covered

- Mobile source controls clipping: use wrapping source-control layout and Touch button sizing.
- First analysis path buried below metrics: keep source controls ahead of secondary metrics on narrow screens.
- Source-first reading order regression: covered by the `keeps source controls before the analysis summary` App test.
- Inconsistent action styling: route actions through `Button` and icon-button sizing.
- Small touch targets: use `size="lg"` or `size="icon-lg"` when the control is mobile-primary.
- Compact navigation clipping: allow trigger wrapping and avoid fixed-width labels.
- Heavy nested cards: prefer `Card` once per logical panel, with repeated rows inside.
- Dense uppercase labels: keep metadata short and use normal body text for explanations.
- Workspace empty/loading/error handoff gap: page `34 Workspace State Matrix` now maps runtime triggers, visual anatomy, code paths, and role/aria expectations before implementation.
