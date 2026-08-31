# Tonight's first leftover last-return

The ready rehearsal map names the first leftover last-return from existing `partGraph` evidence: a named leftover sit-out, then a later named leftover return where at least one leftover named part is own-property active and at least one leftover remains own-property tacet, then a later named section where every remaining leftover is own-property active. This is who comes back last after remaining leftover. It is not a come-in, tacet, leftover sit-out, leftover return, remaining leftover, tutti, handoff, Fine, last-line breath, a leftover return with nobody still out, a continued remaining leftover, or a new dropout after remaining leftover.

## Next action

- Named leftover last-return: come in from the top of the named leftover last-return after staying leftover from the leftover return.
- Named returning or other included part: count the leftover last-return in from the top of that return.
- Missing: confirm who comes in last after remaining leftover before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property leftover sit-out, leftover return with remaining leftover, and a later named leftover last-return where every remaining leftover is own-property active.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a leftover last-return. Inherited `is_active` is isolated. A leftover return with nobody still out is a leftover return, not a leftover last-return. A remaining leftover with nobody coming back last is remaining leftover, not a leftover last-return. All-active later sections after a full original return are tuttis, not leftover last-returns. Continued remaining leftovers are not leftover last-returns. A new dropout after remaining leftover is a dropout, not a leftover last-return. When a role is selected, only a leftover last-return after a leftover sit-out that includes that named part is shown.
- Safe failure: inherited flags, blank labels, missing names, leftover sit-outs without leftover return, leftover returns with nobody still out, remaining leftovers without a later last-return, come-ins without a leftover, full-band returns, continued remaining leftovers, new dropouts after remaining leftover, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a leftover last-return.
- Logging/privacy: rejected or accepted leftover last-returns are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstLeftoverLastReturn.test.ts` and the Workspace callout cover the demo all-active case, an explicit lead leftover last-return after remaining leftover, selected-role scoping, inherited flags, missing `is_active`, continued remaining leftovers, tuttis, come-ins, leftover returns with nobody still out, remaining leftovers without last-return, new dropouts after remaining leftover, unnamed roles, empty graphs, and literal copy filling.
