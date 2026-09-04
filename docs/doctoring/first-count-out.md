# Tonight's first count-out

The ready rehearsal map names the first named section end from existing `timeRange.end` evidence. This is the last bar a player should count out so the band leaves together. It is not a count-in, click, chart bar, or Fine.

## Next action

- Named: count out that last bar before leaving the named section.
- Missing: confirm where the first section ends before you leave it.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `timeRange.start` / `timeRange.end`, `partGraph` nodes, `is_active`, and role ids from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property finite non-negative section ends at or after the matching start.
- Allowlist: section labels must be meaningful text. Ends must format as `m:ss` at or below the shared section-time ceiling. When a role is selected, only an own-property active `partGraph` node (or a named role when no graph node exists) can own the count-out.
- Safe failure: inherited time fields, inverted spans, inactive selected parts, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing an end.
- Logging/privacy: rejected or accepted times are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstCountOut.test.ts` and the Workspace callout cover the demo verse end, inverted/inherited times, selected-role scoping, sit-out isolation, and literal copy filling.
