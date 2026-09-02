# First unlogged practice pass

The ready workspace names the first part that still has no stored `practiceProgress` so a player can select it and record tonight's first pass.

## Authority

`firstUnloggedPractice` is the only unlogged-pass helper. It walks sections and roles in song order, requires unique owned identity and a named section/part, treats missing `practiceProgress` as unlogged, and skips non-integer or out-of-range marks instead of inventing a pass.

#1107 still owns the selected-part tracker copy. This slice does not start playback (#961) or change MIR (#828 / #770).

## Security notes

- Untrusted input: `practiceProgress` and role/section identity inside a loaded project payload.
- Trust boundary: project JSON → lexical admission → React copy.
- Safe failure: no filesystem, URL, or network dereference; malformed marks never become practice authority.
