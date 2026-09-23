# First section finish evidence

The ready rehearsal map names the first valid section end from existing `timeRange.end` evidence. That timestamp supports a structural section-finish cue only. It does not establish a breath, last bar, count-out, count-in, click, chart bar, or Fine.

The historical filename remains temporarily for lineage. Canonical implementation authority is `apps/desktop/src/features/workspace/firstSectionFinish.ts`; `firstBreath.ts` is a compatibility adapter for existing Workspace/i18n identifiers and has an explicit removal condition.

## Next action

- Named: show the section label and validated end time, then ask the band to finish together at the section boundary.
- Missing: ask the player to confirm the section ending before rehearsal starts.

## Security notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `timeRange.start` / `timeRange.end`, `partGraph` nodes, `is_active`, and role ids from analysis or a reopened project.
- Trust boundary: the helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property finite non-negative section ends at or after the matching start.
- Allowlist: section labels must be meaningful text. Ends must format as `m:ss` at or below the shared section-time ceiling. When a role is selected, only an own-property active `partGraph` node, or a named role when no graph node exists, can make that section relevant.
- Safe failure: inherited time fields, inverted spans, inactive selected parts, and malformed roots return `null`, so the workspace shows the missing-copy action rather than crashing or inventing evidence.
- Logging/privacy: rejected or accepted times are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstSectionFinish.naming.test.ts`, the compatibility tests, and the Workspace callout bind the structural section-finish meaning and selected-role behavior.

## Removal condition

Rename the remaining Workspace/i18n compatibility identifiers (`firstBreath`, `workspaceFirstBreath*`, `first-breath`) only in the owning UI/i18n change that updates all call sites, locale contracts, tests, and accessibility selectors together. Until then, they are compatibility names, not domain truth.
