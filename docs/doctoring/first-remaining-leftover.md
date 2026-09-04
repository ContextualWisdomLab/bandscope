# Tonight's first remaining leftover

The ready rehearsal map names the first remaining leftover from existing `partGraph` evidence: a named leftover sit-out, then a later named leftover return where at least one leftover named part is own-property active and at least one leftover remains own-property tacet. This is who still stays out while the leftover part comes back. It is not a come-in, tacet, leftover sit-out, leftover return, tutti, handoff, Fine, last-line breath, a leftover return with nobody still out, a continued sit-out with nobody returning, or a new dropout after every original sit-out returns.

## Next action

- Named remaining leftover: stay out from the top of the named leftover return while the leftover part comes back.
- Named returning or other included part: count the remaining leftover out from the top of the named leftover return.
- Missing: confirm who stays out at the leftover return before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property leftover sit-out followed by a later named leftover return where a leftover part is own-property active and another leftover remains own-property tacet.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a remaining leftover. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a remaining leftover. A leftover return with nobody still out is a leftover return, not a remaining leftover. All-active later sections after a full original return are tuttis, not remaining leftovers. Continued sit-outs with nobody returning are not remaining leftovers. A new dropout after every original sit-out returns is a dropout, not a remaining leftover. When a role is selected, only a remaining leftover after a leftover sit-out that includes that named part is shown.
- Safe failure: inherited flags, blank labels, missing names, leftover sit-outs without a leftover return, leftover returns with nobody still out, come-ins without a leftover, full-band returns, continued sit-outs, new dropouts after a full original return, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a remaining leftover.
- Logging/privacy: rejected or accepted remaining leftovers are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstRemainingLeftover.test.ts` and the Workspace callout cover the demo all-active case, an explicit lead remaining leftover after a leftover return, selected-role scoping, inherited flags, missing `is_active`, continued sit-outs, tuttis, come-ins, leftover returns with nobody still out, new dropouts after a full original return, unnamed roles, empty graphs, and literal copy filling.
