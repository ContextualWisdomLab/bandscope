# First unlogged practice pass

The ready workspace names the first part that still has no stored `practiceProgress` so a player can select it and record tonight's first pass.

## Authority

`firstUnloggedPractice` is the only unlogged-pass helper. It walks sections and roles in song order, requires owned role/section identity, allows the same role id to recur across sections only when its display name remains consistent, treats a role as unlogged only when every admitted section copy omits `practiceProgress`, and rejects duplicate ids inside one section or malformed/conflicting practice evidence instead of inventing a pass.

Issue `#1107` still owns the selected-part tracker copy. This slice does not start playback (`#961`) or change MIR (`#828` / `#770`).

## Security notes

- Untrusted input: `practiceProgress` and role/section identity inside a loaded project payload.
- Trust boundary: project JSON → lexical admission → React copy.
- Safe failure: inherited identity, malformed collections, conflicting section copies, and malformed marks never become rehearsal authority; no filesystem, URL, subprocess, IPC, or network dereference is added.
