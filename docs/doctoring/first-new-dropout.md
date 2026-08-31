# Tonight's first new dropout

The ready rehearsal map names the first new dropout from existing `partGraph` evidence: a named reduced section, then a later named leftover return where every previously sitting-out named part is own-property active, and a named part that was not in that reduced cohort is own-property tacet either in that leftover-return section or in a later named section. This is who newly sits out after leftover parts come back. It is not a come-in, tacet, leftover sit-out, leftover return, remaining leftover, tutti, handoff, Fine, last-line breath, a continued sit-out with nobody returning, or a leftover that never returns.

Gould (2011) treats a later rest or tacet after a return as a new sit-out for that part, not as leftover of the earlier rest. MusicXML 4.0 records the same activity on each part at each measure; a later rest after every earlier silent part has resumed is new dropout evidence, not leftover evidence (MakeMusic & W3C Music Notation Community Group, 2021).

## Next action

- Named new dropout: stay out from the top of the named section after leftover parts return.
- Named returning or other included part: count the new dropout out from the top of the named section.
- Trustworthy all-active timeline: no new-dropout cue is needed; rehearse from the first section without a new sit-out cue.
- Missing or malformed evidence: confirm who newly sits out after the leftover return before the first section rather than inventing a cue.
- Open uses the renderer-owned `[data-testid=song-structure-grid] [data-section-index=N]` landing. Analysis `section.id` is never DOM-ID authority. Reduced-motion Open uses `behavior: "auto"`.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, `partGraph` nodes, `is_active`, role ids, and role names from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits an own data-property leftover return followed by a later own data-property tacet on a part that was not in the reduced cohort.
- Allowlist: section labels and role names must be meaningful text. A missing graph node is not a new dropout. Inherited `is_active` is isolated. Own accessors and Proxy get-traps cannot substitute `is_active`. Sparse `partGraph` arrays fail closed. Same-section false-then-true nodes are not a return. A leftover sit-out, remaining leftover, come-in, tutti leftover return with nobody newly out, or a continued sit-out with nobody returning is not a new dropout. When a role is selected, only a new dropout after a leftover return that includes that named part is shown.
- Safe failure: inherited flags, own accessors, Proxy get-traps, sparse arrays, blank labels, missing names, leftover sit-outs without a leftover return, leftover returns with nobody newly out, come-ins, remaining leftovers, continued sit-outs, and malformed roots return `null`. The workspace distinguishes a trustworthy all-active timeline from malformed or missing evidence, so only the former gets an explicit “no new dropout needed” next action.
- Logging/privacy: rejected or accepted new dropouts are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstNewDropout.test.ts`, `firstNewDropout.selected-role.test.ts`, and the Workspace callout cover the trustworthy all-active case, an explicit lead new dropout after a leftover return, same-section new dropouts, selected-role scoping, inherited flags, missing `is_active`, own accessors, Proxy get-traps, sparse arrays, leftover sit-outs, remaining leftovers, come-ins, tuttis, continued sit-outs, unnamed roles, empty graphs, renderer-owned Open, reduced-motion auto scrolling, and literal copy filling.

## References

Gould, E. (2011). *Behind bars: The definitive guide to music notation*. Faber Music.

MakeMusic & W3C Music Notation Community Group. (2021). *MusicXML 4.0*. World Wide Web Consortium. https://www.w3.org/2021/06/musicxml40/
