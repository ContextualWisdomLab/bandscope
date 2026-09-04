# Tonight's first come-in

The ready rehearsal map names the first explicit return from existing `partGraph` evidence: a part that sat out (`is_active: false`) on a named section and is own-property active again on a later named section. This is where the player should come back in so the band does not miss the entrance after a rest. It is not a tacet, dropout, handoff, Fine, last-line breath, or the song's opening entrance.

## Next action

- Named: play from the top of the named section after sitting out of the earlier section.
- Missing: confirm where the sitting-out part comes back before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property `is_active: false` followed by a later own-property `is_active: true` on a named section.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a come-in. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a return. When a role is selected, only that part's own-property return is named.
- Safe failure: inherited flags, blank labels, missing names, opening entrances without a prior sit-out, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a return.
- Logging/privacy: rejected or accepted come-ins are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstComeIn.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys return on chorus, selected-role scoping, inherited flags, missing `is_active`, opening-entrance rejection, unnamed roles, and literal copy filling.
