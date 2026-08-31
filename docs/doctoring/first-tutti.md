# Tonight's first tutti

The ready rehearsal map names the first full-band hit from existing `partGraph` evidence: a named section where every named graph node is own-property active after an earlier named section had at least one own-property sit-out. This is where the band should play together so a reduced texture does not miss the return. It is not a come-in, tacet, dropout, handoff, Fine, last-line breath, or the song's opening full-band entrance.

## Next action

- Named: play together from the top of the named section after the reduced earlier section.
- Missing: confirm where every sitting-out part is back in before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property sit-out on a named section followed by a later named section whose named graph nodes are all own-property active.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a tutti. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a return. Single-part hits are not a tutti. When a role is selected, only a tutti that includes that named part is shown.
- Safe failure: inherited flags, blank labels, missing names, opening full-band entrances without a prior sit-out, leftover sit-outs, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a hit.
- Logging/privacy: rejected or accepted tuttis are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstTutti.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys sit-out then chorus hit, selected-role scoping, inherited flags, missing `is_active`, opening-entrance rejection, single-part hits, leftover sit-outs, unnamed roles, and literal copy filling.
