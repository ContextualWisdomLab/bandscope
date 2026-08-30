# Tonight's first priority lock

The ready rehearsal map names the first high-priority part a player should lock before the next section. Medium-priority parts are a first-pass fallback. Low-priority parts are never advertised as tonight's first lock-in.

## Next action

- High: lock that entrance on the instrument or voice before the named section.
- Medium: keep the part in the first pass after the high-priority lock-in.
- Missing: pick a high-priority entrance and lock it before the first section.

## Security Notes

- Untrusted inputs: `RehearsalSong` JSON, section labels, role ids/names, and `rehearsalPriority` values from analysis or a reopened project.
- Trust boundary: this helper never opens files, URLs, IPC, WebView, subprocesses, model artifacts, or export paths. It only admits own-property `high` / `medium` strings and meaningful labels for copy.
- Allowlist: `rehearsalPriority` must be the exact strings `high` or `medium`. Inherited prototype members, blank names, and unknown ranks fail closed.
- Safe failure: malformed roots return `null` so the workspace shows the missing-copy next action instead of crashing or inventing a lock-in.
- Logging/privacy: rejected or accepted role names are not logged. Copy interpolation keeps rehearsal values literal.
- Tests: `firstPriorityLock.test.ts` and the Workspace callout cover high preference, medium fallback, selected-role scoping, low-priority omission, inherited/malformed evidence, and literal copy filling.
