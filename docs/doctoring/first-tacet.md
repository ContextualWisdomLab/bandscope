# Tonight's first tacet

The ready rehearsal map names the first explicit sit-out from existing `partGraph` `is_active: false` evidence. This is the section a player should stay out of so the band does not fill a rest. The helper does not infer additional rehearsal semantics from section labels, handoff fields, or neighboring sections.

## Next action

- Named: stay out of the named section until the next named section.
- Missing: confirm who sits before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It admits only own-property `is_active: false` graph evidence and resolves display names from trustworthy song-wide role metadata.
- Production compatibility: analysis keeps inactive parts in `partGraph` but omits them from that section's active-only `roles` list. Role names are therefore resolved from own `roles` arrays across the song, including a later section where the part is active.
- Allowlist: section labels, role ids, and role names must be meaningful text. Role arrays must be own properties, role entries must expose own ids and names, and contradictory names for the same role id fail closed. A missing graph node or missing activity flag is not a tacet. When a role is selected, only that part's own-property sit-out is named.
- Safe failure: inherited activity flags or role arrays, blank labels, missing or contradictory names, missing activity flags, and malformed roots return `null` or are excluded from authority so the workspace shows the missing-copy next action instead of crashing or inventing a sit-out.
- Logging/privacy: rejected or accepted sit-outs are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstTacet.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys sit-out, production-shaped inactive-role omission, selected-role scoping, inherited activity and role metadata, missing `is_active`, malformed roots, and literal copy filling.