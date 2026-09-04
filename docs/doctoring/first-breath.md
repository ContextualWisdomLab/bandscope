# Tonight's first breath

The ready rehearsal map names the first named section end from existing `timeRange.end` evidence. This is the last-line breath a player should take so the band finishes the phrase together. It is not a count-out, count-in, click, chart bar, or Fine.

## Next action

- Named: breathe together before the last line of the named section.
- Missing: confirm the last-line breath before you leave the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `timeRange.start` / `timeRange.end`, `partGraph` nodes, `is_active`, and role ids from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property finite non-negative section ends at or after the matching start.
- Allowlist: section labels must be meaningful text. Ends must format as `m:ss` at or below the shared section-time ceiling. When a role is selected, only an own-property active `partGraph` node (or a named role when no graph node exists) can own the breath.
- Safe failure: inherited time fields, inverted spans, inactive selected parts, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing an end.
- Logging/privacy: rejected or accepted times are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstBreath.test.ts` and the Workspace callout cover the demo verse end, inverted/inherited times, selected-role scoping, sit-out isolation, and literal copy filling.
