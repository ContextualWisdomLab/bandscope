# Tonight's first tacet

The ready rehearsal map names the first explicit sit-out from existing `partGraph` `is_active: false` evidence. This is the section a player should not play so the band does not fill a rest. It is not a dropout, handoff, Fine, or last-line breath.

## Next action

- Named: stay out of the named section until the next named section.
- Missing: confirm who sits before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property `is_active: false` on a named section.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a tacet. Inherited `is_active` is isolated. When a role is selected, only that part's own-property sit-out is named.
- Safe failure: inherited flags, blank labels, missing names, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a sit-out.
- Logging/privacy: rejected or accepted sit-outs are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstTacet.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys sit-out, selected-role scoping, inherited flags, missing `is_active`, and literal copy filling.
