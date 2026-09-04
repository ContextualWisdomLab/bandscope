# Rehearsal cockpit tempo, starting chord, and transpose next actions

The analysis-summary Tempo, Key, and Transpose metrics stay pending until owned rehearsal fields can name a next action.

- Tempo uses an own integer `song.tempo` in `1..=400`. The next action is counting that BPM in before the first entrance.
- Key uses the first bounded entrance section's highest-priority unique active part. A user harmony override wins over the owned model chord. The metric shows a starting shape, not a claimed song-wide key.
- Transpose uses that same first-entrance section and the highest-priority unique active part that owns a single-line `transpositionPlan`. Simplification copy is not a transpose plan.

Cockpit Open/Lock actions scroll renderer-owned workspace surfaces (`workspace-surface-tempo`, `workspace-surface-harmony`, then `workspace-surface-transpose`). Completion copy is armed only after `scrollIntoView` succeeds. Reduced-motion requests use `behavior: "auto"`.

## Security Notes

- Untrusted input: song, section, time-range, role, graph, harmony, override, and transpose-plan metadata are runtime data; inherited properties and arrays masquerading as records are not authority.
- Trust boundary: cockpit metrics accept required fields only when the inspected record owns them. Navigation targets are renderer-owned element ids, never analysis ids or payload strings.
- Mitigations: dense collections require own indexed elements; chord/plan/role strings are bounded and reject newlines; BPM must be a positive integer; missing values stay pending; scroll no-ops when the surface cannot move.
- Test points: inherited song/section/timing/role/graph/harmony metadata is rejected; duplicate role identities stay band-wide/pending; user overrides beat model chords; simplification is not a transpose plan; reduced-motion scroll uses `auto`.
