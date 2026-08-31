# Tonight's first leftover last-dropout

The ready rehearsal map names the first leftover last-dropout from existing `partGraph` evidence: a named leftover sit-out, then a later named leftover return where at least one leftover named part is own-property active and at least one leftover remains own-property tacet, then a later named leftover last-return where every remaining leftover is own-property active, then a later named section where at least one named part is own-property tacet. This is who sits out after leftover last-return. It is not a come-in, tacet, leftover sit-out, leftover return, remaining leftover, leftover last-return, tutti, handoff, Fine, last-line breath, a leftover last-return without a later sit-out, a new dropout after remaining leftover, or a new MIR product.

## Next action

- Named leftover last-dropout: stay out from the top of the named leftover last-dropout after leftover last-return.
- Named returning or other included part: count the leftover last-dropout out from the top of that sit-out.
- Missing: confirm who sits out after leftover last-return before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own-property leftover sit-out, leftover return with remaining leftover, leftover last-return, and a later named leftover last-dropout where at least one named part is own-property tacet.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a leftover last-dropout. Inherited `is_active` is isolated. A leftover last-return is leftover last-return, not leftover last-dropout. A new dropout after remaining leftover is a dropout, not a leftover last-dropout. All-active later sections after leftover last-return are tuttis, not leftover last-dropouts. When a role is selected, only a leftover last-dropout after a leftover last-return that includes that named part, or a later sit-out of that named part, is shown.
- Safe failure: inherited flags, blank labels, missing names, leftover sit-outs without leftover return, leftover last-returns without a later sit-out, come-ins without a leftover, full-band returns, remaining leftovers without last-return, new dropouts after remaining leftover, unnamed roles, empty graphs, and malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a leftover last-dropout.
- Logging/privacy: rejected or accepted leftover last-dropouts are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstLeftoverLastDropout.test.ts` and the Workspace callout cover the demo all-active case, an explicit keys leftover last-dropout after leftover last-return, selected-role scoping, inherited flags, missing `is_active`, leftover last-returns without later sit-out, tuttis, come-ins, leftover returns with nobody still out, remaining leftovers without last-return, new dropouts after remaining leftover, unnamed roles, empty graphs, and literal copy filling.
