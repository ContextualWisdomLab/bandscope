# Tonight's first leftover sit-out

The ready rehearsal map names the first leftover sit-out from existing `partGraph` evidence: a named section where at least one previously sitting-out named part is own-property active and at least one previously sitting-out named part is still own-property tacet. This is where the returning parts should play without waiting, and the leftover part should stay out. It is not a come-in, tacet, dropout, tutti, handoff, Fine, last-line breath, a continued sit-out with nobody returning, or a new dropout after every original sit-out returns.

## Next action

- Named returning part: play the named section without waiting for the leftover part.
- Named leftover part: stay tacet through the named section after the reduced earlier section.
- Missing: confirm who stays tacet after others return before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property sit-out on a named section followed by a later named section with a partial return and a leftover sit-out.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a leftover. Inherited `is_active` is isolated. Same-section false-then-true nodes are not a return. All-active later sections are tuttis, not leftovers. Continued sit-outs with nobody returning are not leftovers. A new dropout after every original sit-out returns is a dropout, not a leftover. When a role is selected, only a leftover section that includes that named part is shown.
- Safe failure: inherited flags, blank labels, missing names, full-band returns, continued sit-outs, new dropouts after a full original return, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a leftover.
- Logging/privacy: rejected or accepted leftovers are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstLeftover.test.ts` and the Workspace callout cover the demo all-active case, an explicit bass return with keys leftover, selected-role scoping, inherited flags, missing `is_active`, continued sit-outs, full-band returns, new dropouts after a full original return, unnamed roles, empty graphs, and literal copy filling.
