# Tonight's first part handoff

The ready rehearsal map names the first active part-to-part pass from existing `partGraph.handoff_to` evidence. This is the musical pass a player should lock before the next section. It is not the metadata-handoff export file.

## Next action

- Named: lock that pass on the giving and receiving parts before the named section.
- Missing: pick who receives the next entrance and lock that pass before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, role ids/names, `partGraph` nodes, `is_active`, and `handoff_to` values from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property active nodes and meaningful role names for copy.
- Allowlist: `is_active` must be the own-property boolean `true`. Receivers must be named roles in the same section and must not equal the giver. Inherited prototype members, blank names, `none` sentinels, and unknown ids fail closed.
- Safe failure: malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a pass.
- Logging/privacy: rejected or accepted role names are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstHandoff.test.ts` and the Workspace callout cover the demo pass, inactive skip, selected-role scoping, inherited/malformed evidence, and literal copy filling.
