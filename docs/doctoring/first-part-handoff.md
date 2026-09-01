# Tonight's first part handoff

The ready rehearsal map names the first active part-to-part pass from existing `partGraph.handoff_to` evidence. Analysis records that transition on the source section, while the rehearsal cue belongs to the immediately following destination section. The workspace therefore names the destination section a player is preparing to enter. A one-section song has no transition to name and fails closed to the missing-pass next action. This is not the metadata-handoff export file.

## Next action

- Named: lock that pass on the giving and receiving parts before the named destination section.
- Missing: pick who receives the next entrance and lock that pass before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, source and destination section labels, role ids/names, `partGraph` nodes, `is_active`, and `handoff_to` values from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property active nodes, meaningful role names, and a meaningful immediately-following section label for copy.
- Allowlist: `is_active` must be the own-property boolean `true`. Receivers must be named roles in the source section and must not equal the giver. Inherited prototype members, blank names, `none` sentinels, unknown ids, malformed destinations, and blank destination labels fail closed.
- Safe failure: malformed roots or missing destination sections return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a pass.
- Logging/privacy: rejected or accepted role names are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstHandoff.test.ts` and the Workspace callout cover destination labeling, absent/malformed destinations, inactive skip, selected-role scoping, inherited/malformed evidence, and literal copy filling.
