# Tonight's first leftover return

The ready rehearsal map names the first leftover return from existing `partGraph` evidence: a named leftover sit-out, then a later named section where that leftover named part is own-property active. This is where the leftover part comes back after staying out while others returned. It is not a come-in, tacet, leftover sit-out, tutti, handoff, Fine, last-line breath, a continued sit-out with nobody returning, or a new dropout after every original sit-out returns.

## Next action

- Named leftover part: play from the top of the named return section after staying out of the leftover sit-out.
- Named returning or other included part: count the leftover part in from the top of the named return section.
- Missing: confirm where the leftover part returns before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property leftover sit-out followed by a later named section where the leftover part is own-property active.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a leftover return. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a return. All-active later sections after a full original return are tuttis, not leftover returns. Continued sit-outs with nobody returning are not leftover returns. A new dropout after every original sit-out returns is a dropout, not a leftover return. When a role is selected, only a leftover return after a leftover sit-out that includes that named part is shown.
- Safe failure: inherited flags, blank labels, missing names, leftover sit-outs without a later return, come-ins without a leftover, full-band returns, continued sit-outs, new dropouts after a full original return, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a leftover return.
- Logging/privacy: rejected or accepted leftover returns are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstLeftoverReturn.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys return after a leftover sit-out, selected-role scoping, inherited flags, missing `is_active`, continued sit-outs, tuttis, come-ins, new dropouts after a full original return, unnamed roles, empty graphs, and literal copy filling.
