# Tonight's first leftover return

The ready rehearsal map names the first leftover return from existing `partGraph` evidence: a named leftover sit-out, then a later named section where an eligible leftover named part is own-property active. This is where one of the parts still sitting out after a partial return comes back. It is not a come-in, tacet, leftover sit-out, tutti, handoff, Fine, last-line breath, a continued sit-out with nobody returning, or a new dropout after every original sit-out returns.

## Next action

- Named leftover part: play from the top of the named return section after staying out of the leftover sit-out.
- Named returning or other included part: count the first eligible leftover part in from the top of the named return section.
- Trustworthy all-active timeline: no leftover-return cue is needed; rehearse from the first section without a count-back cue.
- Missing or malformed evidence: confirm where the leftover part returns before the first section rather than inventing a cue.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property activity evidence from complete named-role graphs.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a leftover return. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a return. All-active later sections after a full original return are tuttis, not leftover returns. Continued sit-outs with nobody returning are not leftover returns. A new dropout after every original sit-out returns is a dropout, not a leftover return.
- Cohort ordering: when multiple named parts remain out after a partial return, the pending cohort is preserved and the first one that actually returns in later timeline order wins; graph-array order does not suppress an earlier real return.
- Selected-role scoping: an active selected role may count in a leftover from its own current reduction. A selected role that was not part of an earlier reduction is not shown that cohort's cue; if it newly drops out, the search rebases to that later reduction so its own later return can still be found.
- Safe failure: inherited flags, blank labels, missing names, leftover sit-outs without a later return, come-ins without a leftover, full-band returns, continued sit-outs, new dropouts after a full original return, and malformed roots return `null`. The workspace distinguishes a trustworthy all-active timeline from malformed or missing evidence, so only the former gets an explicit “no leftover return needed” next action.
- Logging/privacy: rejected or accepted leftover returns are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstLeftoverReturn.test.ts`, `firstLeftoverReturn.selected-role.test.ts`, and the Workspace callouts cover the trustworthy all-active case, explicit leftover returns, multiple pending leftovers with different return times, selected-role cohort isolation and rebasing, inherited flags, missing `is_active`, continued sit-outs, tuttis, come-ins, new dropouts after a full original return, unnamed roles, empty graphs, and literal copy filling.
